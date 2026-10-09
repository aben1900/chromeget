'use strict';
const provider=require('./ai-provider.cjs');
async function dispatch(p){
 if(p.op==='normalize'){if(p.key!==undefined&&!provider.hasKey(p.key))throw Error('KEY_NOT_CONFIGURED');return p.profile?provider.normalizeProfile(p.profile):provider.presets();}
 if(p.op==='cc-list')return require('./ai-ccswitch.cjs').listClaudeProviders(p.dbPath);
 if(p.op==='cc-resolve')return require('./ai-ccswitch.cjs').resolveClaudeProvider(p.dbPath,p.id,p.model);
 if(p.op==='request')return require('./ai-transport.cjs').requestSummary(p.profile,p.text,p.length,{isTest:p.isTest===true});
 throw Error('CONFIG_INVALID');
}
const codes=new Set(['CONFIG_INVALID','KEY_NOT_CONFIGURED','CC_CONFIG_UNAVAILABLE','INPUT_EMPTY','INPUT_TOO_LARGE','AUTH_FAILED','RATE_LIMITED','MODEL_UNAVAILABLE','NETWORK_TIMEOUT','NETWORK_ERROR','RESPONSE_INVALID','RESPONSE_TOO_LARGE','OUTPUT_INCOMPLETE']);
if(require.main===module){let input='';process.stdin.setEncoding('utf8');process.stdin.on('data',b=>{input+=b;if(Buffer.byteLength(input)>1048576)process.exit(1);});process.stdin.on('end',async()=>{try{const result=await dispatch(JSON.parse(input.replace(/^\uFEFF/,'')));console.log(JSON.stringify({ok:true,result}));}catch(e){console.log(JSON.stringify({ok:false,code:codes.has(e.message)?e.message:'CONFIG_INVALID'}));}});}
module.exports={dispatch};
