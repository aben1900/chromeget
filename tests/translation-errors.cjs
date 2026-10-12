const assert=require('assert/strict'),fs=require('fs'),vm=require('vm');
const ctx=vm.createContext({window:{},chrome:{runtime:{sendMessage:async()=>({ok:false,code:'MICROSOFT_NETWORK_ERROR'})}}});
vm.runInContext(fs.readFileSync('extension/library-ai-api.js','utf8'),ctx);
const api=ctx.window.LibraryAiApi;
(async()=>{
 try{await api.send('free-translate');assert.fail('expected failure')}catch(e){assert.match(api.explain(e),/微软.*连接失败/);}
 assert.match(api.explain(Error('MICROSOFT_PERMISSION_REQUIRED')),/权限/);
 assert.match(api.explain(Error('TRANSLATION_TIMEOUT')),/超时/);
 assert.match(api.explain(Error('TRANSLATION_HTTP_403')),/403/);
 assert.ok(!api.explain(Error('TRANSLATION_HTTP_403')).includes('TRANSLATION_HTTP'));
 assert.match(api.explain(Error('TRANSLATION_HTTP_429')),/频繁/);
 console.log('PASS translation failures have readable network, permission, timeout and HTTP explanations');
})().catch(e=>{console.error(e);process.exitCode=1});
