'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {normalizeProfile,hasKey}=require('./ai-provider.cjs');
const hash=v=>crypto.createHash('sha256').update(JSON.stringify(v)).digest('hex');
function safeFile(file){let p=path.resolve(file);while(true){if(fs.existsSync(p)&&fs.lstatSync(p).isSymbolicLink())throw Error('IMPORT_UNAVAILABLE');const up=path.dirname(p);if(p===up)break;p=up;}if(!fs.existsSync(file)||fs.statSync(file).size>2097152)throw Error('IMPORT_UNAVAILABLE');return file;}
function candidate(p,source,sourceId,secret){
 const normalized=normalizeProfile({...p,tags:p.tags?.length?p.tags:['SMEC']});if(!hasKey(secret))throw Error('KEY_NOT_CONFIGURED');
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

function entries(p){return p.models||[{id:p.model,label:p.label,origins:p.origin?[p.origin]:[],locallyEdited:!!p.origin?.locallyEdited}];}
function locate(settings,c){
 for(const p of Object.values(settings.profiles))for(const m of entries(p))if(m.origins.some(o=>o.source===c.source&&o.sourceId===c.sourceId))return {p,m};
 for(const p of Object.values(settings.profiles))for(const m of entries(p))if(p.baseUrl===c.baseUrl&&p.protocol===c.protocol&&p.auth===c.auth&&m.id===c.model&&m.origins.some(o=>o.credentialFingerprint===c.credentialFingerprint))return {p,m};
 return {};
}
function compareImports(settings,candidates){
 return candidates.map(c=>{
  const {p:existing,m}=locate(settings,c),origin=m?.origins.find(o=>o.source===c.source&&o.sourceId===c.sourceId)||m?.origins[0];
  const connectionChange=!!existing&&(['baseUrl','protocol','auth','provider'].some(k=>existing[k]!==c[k])||origin?.credentialFingerprint!==c.credentialFingerprint);
  const ignored=settings.imports.ignored.includes(c.source+':'+c.sourceId);
  const same=!!existing&&origin?.fingerprint===c.fingerprint&&!connectionChange&&m.id===c.model&&!m.locallyEdited&&!existing.locallyEdited;
  return {...c,candidateId:hash([c.source,c.sourceId]),targetId:existing?.profileId,targetModelId:m?.id,targetRevision:existing?.revision,connectionChange,affectedModels:connectionChange?entries(existing).map(m=>m.id):[],conflict:!!existing&&(connectionChange||!!m.locallyEdited||!!existing.locallyEdited)&&!same,change:existing?(same?'same':'update'):(ignored?'ignored':'add')};
 });
}
function applyCandidate(settings,c,ciphertext,targetId,matchingIds){
 const {normalizeConfig}=require('./ai-config-model.cjs');const old=targetId?settings.profiles[targetId]:null;
 if(targetId&&!old)throw Error('IMPORT_CHANGED');
 const original=old&&locate({profiles:{[targetId]:old}},c).m;
 const origin={source:c.source,sourceId:c.sourceId,fingerprint:c.fingerprint,credentialFingerprint:c.credentialFingerprint};
 const sameConnection=old&&matchingIds.includes(targetId)&&['provider','baseUrl','protocol','auth'].every(k=>old[k]===c[k]);
 let target=old;
 const remainingOrigins=original?.origins.filter(o=>!(o.source===c.source&&o.sourceId===c.sourceId))||[];
 if(old&&!sameConnection&&(old.models.length>1||remainingOrigins.length)){
  if(Object.keys(settings.profiles).length>=200)throw Error('CONFIG_LIMIT');
  const wasDefault=settings.defaultProfileId===old.profileId&&old.model===original?.id;
  if(remainingOrigins.length)original.origins=remainingOrigins;else old.models=old.models.filter(m=>m!==original);if(!old.models.some(m=>m.id===old.model))old.model=old.models[0].id;old.revision=crypto.randomUUID();
  target=null;if(wasDefault)settings.defaultProfileId=null;
  target={...old,profileId:crypto.randomUUID(),models:[],label:c.label,model:c.model};
  if(wasDefault){settings.defaultProfileId=target.profileId;settings.selectionRevision=crypto.randomUUID();}
 }else if(!old){
  target=Object.values(settings.profiles).find(p=>matchingIds.includes(p.profileId)&&!p.locallyEdited&&p.models.every(m=>m.origins.length&&!m.locallyEdited)&&['provider','baseUrl','protocol','auth'].every(k=>p[k]===c[k])&&JSON.stringify([...p.tags].sort())===JSON.stringify([...(c.tags||[])].sort()));
 }
 if(!target){if(Object.keys(settings.profiles).length>=200)throw Error('CONFIG_LIMIT');target={...c,profileId:crypto.randomUUID(),model:c.model,models:[],tags:c.tags||[],label:c.tags?.includes('SMEC')?'SMEC 网关':c.label};}
 const previous=target.models.find(m=>m.id===c.model);
 const connectionSame=target.ciphertext&&matchingIds.includes(target.profileId)&&['provider','baseUrl','protocol','auth'].every(k=>target[k]===c[k]);
 if(!connectionSame){target.connectionRevision=crypto.randomUUID();for(const m of target.models){delete m.lastTest;delete m.lastVisionTest;}}
 if(original&&original.id!==c.model&&target===old){if(remainingOrigins.length)original.origins=remainingOrigins;else target.models=target.models.filter(m=>m.id!==original.id);}
 const entry={id:c.model,label:previous?.locallyEdited?previous.label:c.label,origins:[...(previous?.origins||[]).filter(o=>!(o.source===c.source&&o.sourceId===c.sourceId)),origin],locallyEdited:false,...Object.fromEntries(['lastTest','lastVisionTest'].filter(f=>connectionSame&&previous?.[f]).map(f=>[f,previous[f]]))};
 target.models=target.models.filter(m=>m.id!==c.model);target.models.push(entry);
 for(const field of ['provider','protocol','baseUrl','auth'])target[field]=c[field];
 if(!target.models.some(m=>m.id===target.model))target.model=c.model;
 if(!connectionSame)target.ciphertext=ciphertext;target.revision=crypto.randomUUID();target.locallyEdited=false;
 settings.profiles[target.profileId]=normalizeConfig(target);return target.profileId;
}
function publicPreview(items){return items.map(p=>({candidateId:p.candidateId,label:p.label,model:p.model,change:p.change,conflict:p.conflict,connectionChange:p.connectionChange,affectedModels:p.affectedModels||[],verified:p.verified!==false}));}
module.exports={readWorkBuddy,readCcSwitch,readSource,resolveModelId,compareImports,publicPreview,applyCandidate};
