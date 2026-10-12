const fs=require('fs'),vm=require('vm'),assert=require('assert/strict');
(async()=>{
 let granted=false,calls=0;
 const ctx=vm.createContext({URL,AbortController,setTimeout,clearTimeout,chrome:{permissions:{contains:async options=>{assert.equal(options.origins[0],'https://edge.microsoft.com/*');return granted;}}},fetch:async()=>{calls++;return {ok:true,json:async()=>[{translations:[{text:'你好'}]}]}}});
 vm.runInContext(fs.readFileSync('extension/free-translation.js','utf8'),ctx);
 const message={route:'free',text:'Hello',sourceLanguage:'auto',targetLanguage:'zh'};
 await assert.rejects(()=>ctx.browserFreeTranslate(message),e=>e.code==='MICROSOFT_PERMISSION_REQUIRED');assert.equal(calls,0);
 granted=true;assert.equal((await ctx.browserFreeTranslate(message)).text,'你好');assert.equal(calls,1);
 console.log('PASS missing Microsoft host permission is distinguished before network request');
})().catch(e=>{console.error(e);process.exitCode=1});
