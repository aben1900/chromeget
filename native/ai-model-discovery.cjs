'use strict';
const {normalizeProfile,hasKey}=require('./ai-provider.cjs');
const {apiError}=require('./ai-transport.cjs');
function discoverModels(profile,{timeoutMs=20000}={}){
 const p=normalizeProfile({...profile,model:profile.model||'discovery',provider:profile.provider||'custom'});
 if(!hasKey(profile.secret))throw Error('KEY_NOT_CONFIGURED');
 const suffix=p.protocol!=='chat-completions'&&!/\/v1$/.test(p.baseUrl)?'/v1/models':'/models';
 const url=new URL(p.baseUrl+suffix),headers=p.auth==='x-api-key'?{'x-api-key':profile.secret}:{Authorization:'Bearer '+profile.secret};
 if(p.protocol==='anthropic')headers['anthropic-version']='2023-06-01';
 return new Promise((resolve,reject)=>{
  let done=false;const finish=(code,result)=>{if(done)return;done=true;clearTimeout(timer);code?reject(Error(code)):resolve(result)};
  const req=require(url.protocol==='https:'?'node:https':'node:http').get(url,{headers},res=>{
   let size=0;const chunks=[];res.on('data',b=>{size+=b.length;if(size>262144){finish('RESPONSE_TOO_LARGE');req.destroy()}else chunks.push(b)});res.on('error',()=>finish('NETWORK_ERROR'));
   res.on('end',()=>{if(done)return;const body=Buffer.concat(chunks).toString('utf8');if(res.statusCode!==200){finish([404,405].includes(res.statusCode)||(res.statusCode>=300&&res.statusCode<400)?'MODELS_UNAVAILABLE':apiError(res.statusCode,body));return;}try{const j=JSON.parse(body);if(!Array.isArray(j.data))throw Error('RESPONSE_INVALID');if(j.data.length>200)throw Error('RESPONSE_TOO_LARGE');const models=new Map();for(const m of j.data){if(typeof m?.id!=='string'||!m.id.trim()||m.id!==m.id.trim()||m.id.length>200||/[\x00-\x1f]/.test(m.id))throw Error('RESPONSE_INVALID');models.set(m.id,{id:m.id,label:String(m.display_name||m.id).slice(0,200)})}finish(null,[...models.values()]);}catch(e){finish(e.message==='RESPONSE_TOO_LARGE'?e.message:'RESPONSE_INVALID')}});
  });const timer=setTimeout(()=>{finish('NETWORK_TIMEOUT');req.destroy()},Math.min(20000,Math.max(1,timeoutMs)));req.on('error',()=>finish('NETWORK_ERROR'));
 });
}
module.exports={discoverModels};
