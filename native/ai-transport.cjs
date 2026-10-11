'use strict';
const {buildRequest,parseResponse}=require('./ai-provider.cjs');
function apiError(status,body){
 let code='',apiCode='',message='';try{const e=JSON.parse(body).error;apiCode=String(e?.code||'');code=apiCode+' '+String(e?.type||'');message=typeof e?.message==='string'?e.message:'';}catch{}
 // 1220 also covers ordinary API permissions. Only identify an IP restriction when the service says so.
 if(status===403&&apiCode==='1220'&&/(?:\bIP\b|IP地址)/i.test(message))return 'IP_ACCESS_DENIED';
 if(/insufficient_quota|credit_balance_exhausted|spend_limit_exceeded|usage_limit_exceeded/.test(code))return 'QUOTA_EXCEEDED';
 if(/unsupported_country_region_territory/.test(code))return 'REGION_UNSUPPORTED';
 return status===401?'AUTH_FAILED':status===403?'PERMISSION_DENIED':status===429?'RATE_LIMITED':status===404?'MODEL_UNAVAILABLE':status>=500?'SERVICE_UNAVAILABLE':status===400?'API_REQUEST_REJECTED':'NETWORK_ERROR';
}
async function requestSummary(profile,text,length,{isTest=false,timeoutMs=45000,translation=null}={}){
 const request=buildRequest(profile,text,length,isTest,translation),u=new URL(request.url);
 const json=await new Promise((resolve,reject)=>{
  let done=false,timer;const finish=(error,value)=>{if(done)return;done=true;clearTimeout(timer);if(error)reject(Error(error));else resolve(value);};
  const req=require(u.protocol==='https:'?'node:https':'node:http').request(u,{method:'POST',headers:request.headers},res=>{
   const status=res.statusCode;
   const chunks=[];let size=0;res.on('data',b=>{size+=b.length;if(size>262144){finish('RESPONSE_TOO_LARGE');req.destroy();}else chunks.push(b);});
   res.on('error',()=>finish('NETWORK_ERROR'));res.on('end',()=>{const body=Buffer.concat(chunks).toString('utf8');if(status!==200){finish(apiError(status,body));return;}try{finish(null,JSON.parse(body));}catch{finish('RESPONSE_INVALID');}});
  });
  req.on('error',()=>finish('NETWORK_ERROR'));timer=setTimeout(()=>{finish('NETWORK_TIMEOUT');req.destroy();},Math.min(45000,Math.max(1,timeoutMs)));req.end(JSON.stringify(request.body));
 });
 return {text:parseResponse(profile.protocol||profile.provider,json)};
}
module.exports={requestSummary,apiError};
