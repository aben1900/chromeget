'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {normalizeProfile,hasKey}=require('./ai-provider.cjs');
function rows(dbPath){
 let db;try{let p=path.resolve(dbPath);while(true){if(fs.existsSync(p)&&fs.lstatSync(p).isSymbolicLink())throw Error();const up=path.dirname(p);if(up===p)break;p=up;}
  if(!fs.existsSync(dbPath))throw Error();const {DatabaseSync}=require('node:sqlite');db=new DatabaseSync(dbPath,{readOnly:true});return db.prepare("SELECT id,name,settings_config FROM providers WHERE app_type = ?").all('claude');
 }catch{throw Error('CC_CONFIG_UNAVAILABLE');}finally{db?.close();}
}
function profile(row,model){
 const env=JSON.parse(row.settings_config).env||{};const auth=env.ANTHROPIC_AUTH_TOKEN?'bearer':'x-api-key',secret=auth==='bearer'?env.ANTHROPIC_AUTH_TOKEN:env.ANTHROPIC_API_KEY;
 const models=[];for(const [key,role]of [['ANTHROPIC_MODEL','默认'],['ANTHROPIC_DEFAULT_HAIKU_MODEL','Haiku'],['ANTHROPIC_DEFAULT_SONNET_MODEL','Sonnet'],['ANTHROPIC_DEFAULT_OPUS_MODEL','Opus']]){const id=env[key];if(typeof id==='string'&&id.trim()){let item=models.find(v=>v.id===id);if(!item)models.push(item={id,roles:[]});item.roles.push(role);}}
 const selected=model||env.ANTHROPIC_MODEL||models[0]?.id;const revision=crypto.createHash('sha256').update(JSON.stringify([row.id,row.name,env.ANTHROPIC_BASE_URL,auth,secret,models])).digest('hex');
 return {...normalizeProfile({source:'ccswitch',provider:'claude',profileId:'cc:'+row.id,label:row.name,baseUrl:env.ANTHROPIC_BASE_URL,model:selected,auth,hasKey:hasKey(secret),revision,models}),secret};
}
function listClaudeProviders(dbPath){const result=[];for(const row of rows(dbPath)){try{const {secret,...p}=profile(row);result.push(p);}catch{/* An incompatible row must not expose its raw settings. */}}return result;}
function resolveClaudeProvider(dbPath,id,model){try{const row=rows(dbPath).find(v=>v.id===id);if(!row)throw Error();return profile(row,model);}catch{throw Error('CC_CONFIG_UNAVAILABLE');}}
module.exports={listClaudeProviders,resolveClaudeProvider};
