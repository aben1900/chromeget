'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {normalizeProfile,hasKey}=require('./ai-provider.cjs');
const hash=v=>crypto.createHash('sha256').update(JSON.stringify(v)).digest('hex');
function safeFile(file){let p=path.resolve(file);while(true){if(fs.existsSync(p)&&fs.lstatSync(p).isSymbolicLink())throw Error('IMPORT_UNAVAILABLE');const up=path.dirname(p);if(p===up)break;p=up;}if(!fs.existsSync(file)||fs.statSync(file).size>2097152)throw Error('IMPORT_UNAVAILABLE');return file;}
function candidate(p,source,sourceId,secret){
 const normalized=normalizeProfile({...p,tags:p.tags||['SMEC']});if(!hasKey(secret))throw Error('KEY_NOT_CONFIGURED');
 return {...normalized,source,sourceId,secret,credentialFingerprint:hash(secret),fingerprint:hash([sourceId,normalized.label,normalized.baseUrl,normalized.protocol,normalized.auth,normalized.model,secret])};
}
function resolveModelId(localId,availableIds){const id=localId.startsWith('custom:smec-')?localId.slice(12):localId;return {model:availableIds.includes(localId)?localId:id,verified:availableIds.includes(localId)||availableIds.includes(id)};}
function readWorkBuddy(file){
 try{const data=JSON.parse(fs.readFileSync(safeFile(file),'utf8').replace(/^\uFEFF/,''));if(!Array.isArray(data)||data.length>200)throw Error();const ids=new Set();
  return data.filter(v=>{try{return new URL(v.url).hostname==='aigateway.smec-cn.com'}catch{return false}}).map(v=>{
   if(typeof v.id!=='string'||ids.has(v.id))throw Error();ids.add(v.id);
   return candidate({provider:'custom',protocol:'chat-completions',profileId:crypto.randomUUID(),label:v.name,baseUrl:v.url,model:v.id,auth:'bearer',hasKey:true,revision:'import'},'workbuddy',v.id,v.apiKey);
  });
 }catch{throw Error('IMPORT_UNAVAILABLE');}
}
function readCcSwitch(file){
 safeFile(file);const cc=require('./ai-ccswitch.cjs');return cc.listClaudeProviders(file).filter(p=>new URL(p.baseUrl).hostname==='aigateway.smec-cn.com').flatMap(p=>p.models.map(m=>{
  const resolved=cc.resolveClaudeProvider(file,p.profileId.slice(3),m.id);
  return candidate({...resolved,label:'SMEC '+m.id},'ccswitch',p.profileId+':'+m.id,resolved.secret);
 }));
}
function queryModels(p){return new Promise((resolve,reject)=>{
 const u=new URL(p.baseUrl+'/models');let done=false;const end=(error,value)=>{if(done)return;done=true;clearTimeout(timer);error?reject(Error(error)):resolve(value)};
 const req=require(u.protocol==='https:'?'node:https':'node:http').get(u,{headers:{Authorization:'Bearer '+p.secret}},res=>{
  if(res.statusCode!==200){res.resume();end('IMPORT_MODELS_UNAVAILABLE');req.destroy();return;}let size=0;const chunks=[];
  res.on('data',b=>{size+=b.length;if(size>262144){end('RESPONSE_TOO_LARGE');req.destroy();}else chunks.push(b)});
  res.on('error',()=>end('NETWORK_ERROR'));res.on('end',()=>{try{const j=JSON.parse(Buffer.concat(chunks));if(!Array.isArray(j.data))throw Error();end(null,j.data.map(m=>m.id).filter(id=>typeof id==='string'));}catch{end('RESPONSE_INVALID')}});
 });const timer=setTimeout(()=>{end('NETWORK_TIMEOUT');req.destroy()},10000);req.on('error',()=>end('NETWORK_ERROR'));
});}
async function readSource(source,home){
 if(source==='ccswitch')return readCcSwitch(path.join(home,'.cc-switch','cc-switch.db'));
 if(source!=='workbuddy')throw Error('CONFIG_INVALID');
 const rows=readWorkBuddy(path.join(home,'.workbuddy','models.json')),cache=new Map();
 for(const p of rows){const k=p.baseUrl+':'+p.credentialFingerprint;if(!cache.has(k)){try{cache.set(k,await queryModels(p))}catch{cache.set(k,[])}}const mapping=resolveModelId(p.model,cache.get(k));p.model=mapping.model;p.verified=mapping.verified;p.fingerprint=hash([p.sourceId,p.label,p.baseUrl,p.protocol,p.auth,p.model,p.secret]);}
 return rows;
}
function compareImports(settings,candidates){
 return candidates.map(c=>{
  const existing=Object.values(settings.profiles).find(p=>p.origin?.source===c.source&&p.origin?.sourceId===c.sourceId)||Object.values(settings.profiles).find(p=>p.baseUrl===c.baseUrl&&p.protocol===c.protocol&&p.model===c.model&&p.origin?.credentialFingerprint===c.credentialFingerprint);
  const ignored=settings.imports.ignored.includes(c.source+':'+c.sourceId);
  const same=!!existing&&existing.origin?.fingerprint===c.fingerprint&&['label','baseUrl','protocol','auth','model'].every(k=>existing[k]===c[k])&&!existing.origin?.locallyEdited;
  return {...c,candidateId:hash([c.source,c.sourceId]),targetId:existing?.profileId,targetRevision:existing?.revision,conflict:!!existing?.origin?.locallyEdited&&!same,change:existing?(same?'same':'update'):(ignored?'ignored':'add')};
 });
}
function publicPreview(items){return items.map(p=>({candidateId:p.candidateId,label:p.label,model:p.model,change:p.change,conflict:p.conflict,verified:p.verified!==false}));}
module.exports={readWorkBuddy,readCcSwitch,readSource,resolveModelId,compareImports,publicPreview};
