'use strict';
const {buildRequest,parseResponse}=require('./ai-provider.cjs');
async function requestSummary(profile,text,length,{isTest=false,timeoutMs=45000}={}){
 const request=buildRequest(profile,text,length,isTest),u=new URL(request.url);
 const json=await new Promise((resolve,reject)=>{
  let done=false,timer;const finish=(error,value)=>{if(done)return;done=true;clearTimeout(timer);if(error)reject(Error(error));else resolve(value);};
  const req=require(u.protocol==='https:'?'node:https':'node:http').request(u,{method:'POST',headers:request.headers},res=>{
   const status=res.statusCode; if(status!==200){res.resume();finish(status===401||status===403?'AUTH_FAILED':status===429?'RATE_LIMITED':status===404?'MODEL_UNAVAILABLE':'NETWORK_ERROR');req.destroy();return;}
   const chunks=[];let size=0;res.on('data',b=>{size+=b.length;if(size>262144){finish('RESPONSE_TOO_LARGE');req.destroy();}else chunks.push(b);});
   res.on('error',()=>finish('NETWORK_ERROR'));res.on('end',()=>{try{finish(null,JSON.parse(Buffer.concat(chunks).toString('utf8')));}catch{finish('RESPONSE_INVALID');}});
  });
  req.on('error',()=>finish('NETWORK_ERROR'));timer=setTimeout(()=>{finish('NETWORK_TIMEOUT');req.destroy();},Math.min(45000,Math.max(1,timeoutMs)));req.end(JSON.stringify(request.body));
 });
 return {text:parseResponse(profile.protocol||profile.provider,json)};
}
module.exports={requestSummary};
