'use strict';
const crypto=require('node:crypto');
const {presets,normalizeProfile}=require('./ai-provider.cjs');
const validId=id=>typeof id==='string'&&/^(openai|deepseek|[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12})$/.test(id);
function upgradeSettings(value){
 const s=structuredClone(value||{schemaVersion:1,profiles:presets()});
 if(![1,2].includes(s.schemaVersion)||!s.profiles||Array.isArray(s.profiles)||Object.keys(s.profiles).length>200)throw Error('CONFIG_INVALID');
 const profiles={};
 for(const [id,p]of Object.entries(s.profiles)){
  if(!validId(id)||!p||p.profileId!==id)throw Error('CONFIG_INVALID');
  if(p.tags===undefined&&['workbuddy','ccswitch'].includes(p.origin?.source)&&new URL(p.baseUrl).hostname==='aigateway.smec-cn.com')p.tags=['SMEC'];
  profiles[id]={...normalizeProfile(p),ciphertext:typeof p.ciphertext==='string'?p.ciphertext:''};
  if(p.origin)profiles[id].origin=p.origin;
  if(p.lastTest?.revision===p.revision)profiles[id].lastTest=p.lastTest;
 }
 if(s.defaultProfileId&&!profiles[s.defaultProfileId])throw Error('CONFIG_INVALID');
 return {schemaVersion:2,profiles,defaultProfileId:s.defaultProfileId||null,selectionRevision:s.selectionRevision||crypto.randomUUID(),imports:s.imports||{completed:false,ignored:[]},legacySelectionPending:s.legacySelectionPending||null,legacySelectionHandled:!!s.legacySelectionHandled};
}
module.exports={upgradeSettings,validId};
