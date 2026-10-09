'use strict';
const crypto=require('node:crypto');
const {normalizeProfile,presets}=require('./ai-provider.cjs');
const validId=id=>typeof id==='string'&&/^(openai|deepseek|[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12})$/.test(id);
const invalid=()=>{throw Error('CONFIG_INVALID')};
const connectionFields=['provider','protocol','baseUrl','auth'];
function cleanTest(t,connectionRevision){
 if(!t||t.connectionRevision!==connectionRevision||typeof t.ok!=='boolean')return undefined;
 return {connectionRevision,ok:t.ok,code:/^[A-Z_]{1,60}$/.test(t.code)?t.code:'NETWORK_ERROR',at:String(t.at||'').slice(0,50),elapsedMs:Math.max(0,Number(t.elapsedMs)||0)};
}
function normalizeConfig(v){
 const p=normalizeProfile(v);if(!validId(p.profileId))invalid();
 if(!Array.isArray(v.models)||!v.models.length||v.models.length>200)invalid();
 const seen=new Set(),connectionRevision=String(v.connectionRevision||v.revision||'default');
 const models=v.models.map(m=>{if(!m||typeof m.id!=='string'||!m.id.trim()||m.id!==m.id.trim()||m.id.length>200||/[\x00-\x1f]/.test(m.id)||seen.has(m.id))invalid();seen.add(m.id);
  const entry={id:m.id,label:String(m.label||m.id).slice(0,200),origins:Array.isArray(m.origins)?m.origins.map(o=>({source:String(o.source),sourceId:String(o.sourceId),fingerprint:String(o.fingerprint||''),credentialFingerprint:String(o.credentialFingerprint||'')})):[],locallyEdited:!!m.locallyEdited};
  const test=cleanTest(m.lastTest,connectionRevision);if(test)entry.lastTest=test;return entry;});
 if(!seen.has(p.model))invalid();
 return {...p,models,connectionRevision,ciphertext:typeof v.ciphertext==='string'?v.ciphertext:'',locallyEdited:!!v.locallyEdited};
}
function publicConfig(value){
 const p=normalizeConfig(value),{ciphertext,connectionRevision,locallyEdited,...out}=p;
 out.hasKey=!!ciphertext;out.models=p.models.map(m=>({id:m.id,label:m.label,...(m.lastTest?{lastTest:{...m.lastTest,connectionRevision:undefined,revision:p.revision}}:{})}));
 const active=out.models.find(m=>m.id===p.model);if(active.lastTest)out.lastTest=active.lastTest;return out;
}
function migrateSettings(value,credentialGroups={}){
 const s=structuredClone(value||{schemaVersion:1,profiles:presets()});
 if(![1,2,3].includes(s.schemaVersion)||!s.profiles||Array.isArray(s.profiles)||Object.keys(s.profiles).length>200)invalid();
 const profiles={},aliases={},warnings=[];
 for(const [id,old]of Object.entries(s.profiles)){
  if(!validId(id)||!old||old.profileId!==id)invalid();
  if(old.tags===undefined&&['workbuddy','ccswitch'].includes(old.origin?.source)&&new URL(old.baseUrl).hostname==='aigateway.smec-cn.com')old.tags=['SMEC'];
  if(s.schemaVersion!==3){const rev=String(old.revision||'default');old.connectionRevision=rev;old.models=[{id:old.model,label:old.label||old.model,origins:old.origin?[old.origin]:[],locallyEdited:!!old.origin?.locallyEdited}];old.locallyEdited=!!old.origin?.locallyEdited;
   if(old.lastTest?.revision===rev)old.models[0].lastTest={...old.lastTest,connectionRevision:rev};
   if(id==='deepseek'&&!old.ciphertext&&old.model==='deepseek-flash')old.models.push({id:'deepseek-v4-pro',label:'deepseek-v4-pro'});
  }
  profiles[id]=normalizeConfig(old);aliases[id]=id;
 }
 if(s.defaultProfileId&&!profiles[s.defaultProfileId])invalid();
 if(s.schemaVersion!==3){const groups=new Map();for(const p of Object.values(profiles)){
  if(!credentialGroups[p.profileId]||p.locallyEdited||p.models.some(m=>!m.origins.length||m.locallyEdited))continue;
  const key=JSON.stringify([credentialGroups[p.profileId],...connectionFields.map(f=>p[f]),[...p.tags].sort()]);if(!groups.has(key))groups.set(key,[]);groups.get(key).push(p);
 }
 for(const rows of groups.values()){
  rows.sort((a,b)=>a.profileId===s.defaultProfileId?-1:b.profileId===s.defaultProfileId?1:a.profileId.localeCompare(b.profileId));const keep=rows[0];
  if(new Set(rows.flatMap(p=>p.models.map(m=>m.id))).size>200){warnings.push('GROUP_MODEL_LIMIT');continue;}
  for(const p of rows.slice(1)){for(const item of p.models){const m=structuredClone(item);if(m.lastTest)m.lastTest.connectionRevision=keep.connectionRevision;const existing=keep.models.find(x=>x.id===m.id);if(!existing)keep.models.push(m);else{existing.origins.push(...m.origins);if(m.lastTest&&(!existing.lastTest||m.lastTest.at>existing.lastTest.at))existing.lastTest=m.lastTest;}}aliases[p.profileId]=keep.profileId;delete profiles[p.profileId];}
  if(rows.length>1)keep.label=keep.tags.includes('SMEC')?'SMEC 网关':keep.label;
 }}
 return {settings:{schemaVersion:3,profiles,defaultProfileId:s.defaultProfileId?aliases[s.defaultProfileId]:null,selectionRevision:s.selectionRevision||crypto.randomUUID(),imports:s.imports||{completed:false,ignored:[]},legacySelectionPending:s.legacySelectionPending||null,legacySelectionHandled:!!s.legacySelectionHandled},aliases,warnings};
}
function updateConfig(old,message,ciphertext,keyChanged=false){
 const input={...(old||{}),...Object.fromEntries(['label','tags','provider','protocol','baseUrl','auth','model'].filter(k=>message[k]!==undefined).map(k=>[k,message[k]])),profileId:old?.profileId||message.profileId||crypto.randomUUID(),revision:crypto.randomUUID(),ciphertext};
 const list=message.models===undefined?(old?.models||[{id:input.model,label:input.model}]):message.models;
 if(!Array.isArray(list))invalid();
 input.models=list.map(m=>({id:m?.id,label:m?.label}));input.connectionRevision=old?.connectionRevision||crypto.randomUUID();
 let p=normalizeConfig(input);const changed=!old||keyChanged||connectionFields.some(k=>p[k]!==old[k]);
 if(changed)p.connectionRevision=crypto.randomUUID();
 const removed=old?.models.filter(m=>!p.models.some(n=>n.id===m.id))||[];
 for(const m of p.models){const previous=old?.models.find(n=>n.id===m.id);if(previous){m.origins=previous.origins;m.locallyEdited=previous.locallyEdited||m.label!==previous.label;if(!changed&&previous.lastTest)m.lastTest=previous.lastTest;}}
 p.locallyEdited=!!old?.locallyEdited||!!old&&(changed||p.label!==old.label||removed.length>0||p.models.some(m=>!old.models.some(n=>n.id===m.id)));
 return normalizeConfig(p);
}
module.exports={validId,normalizeConfig,migrateSettings,publicConfig,updateConfig,connectionFields};
