'use strict';
const assert=require('assert/strict'),http=require('http'),fs=require('fs'),vm=require('vm'),{spawn}=require('child_process');
const {apiError,requestSummary}=require('../native/ai-transport.cjs');
const {discoverModels}=require('../native/ai-model-discovery.cjs');
const denied='您的请求无法被处理，因为您的IP地址没有接口访问权限。private sk-fixture-do-not-leak';
const response=message=>JSON.stringify({error:{code:'1220',message}});
assert.equal(apiError(403,response(denied)),'IP_ACCESS_DENIED');
assert.equal(apiError(403,response('Your IP address has no access')),'IP_ACCESS_DENIED');
assert.equal(apiError(403,response('您无权访问该 API')),'PERMISSION_DENIED');
assert.equal(apiError(403,JSON.stringify({error:{code:'other',message:denied}})),'PERMISSION_DENIED');
assert.equal(apiError(401,response(denied)),'AUTH_FAILED');
assert.equal(apiError(403,'<html>blocked</html>'),'PERMISSION_DENIED');
const context={window:{}};vm.runInNewContext(fs.readFileSync('extension/library-ai-api.js','utf8'),context);
assert.match(context.window.LibraryAiApi.explain(Error('IP_ACCESS_DENIED')),/IP.*1220/);
assert.doesNotMatch(context.window.LibraryAiApi.explain(Error('PERMISSION_DENIED')),/密钥没有/);
(async()=>{
 let message=denied,count=0;const server=http.createServer((req,res)=>{count++;req.resume();res.writeHead(403,{'Content-Type':'application/json'});res.end(response(message));});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const profile={provider:'custom',protocol:'chat-completions',baseUrl:'http://127.0.0.1:'+server.address().port,model:'glm-4-flash-250414',secret:'sk-fixture-do-not-leak',auth:'bearer'};
 try{
  await assert.rejects(requestSummary(profile,'OK','short',{isTest:true}),e=>e.message==='IP_ACCESS_DENIED');
  await assert.rejects(discoverModels(profile),e=>e.message==='IP_ACCESS_DENIED');
  const result=await new Promise((resolve,reject)=>{const child=spawn(process.execPath,['native/ai-runner.cjs'],{windowsHide:true,stdio:['pipe','pipe','pipe']});let out='';child.stdout.on('data',b=>out+=b);child.on('error',reject);child.on('exit',code=>code?reject(Error('runner failed')):resolve(out));child.stdin.end(JSON.stringify({op:'request',profile,text:'OK',length:'short',isTest:true}));});
  assert.deepEqual(JSON.parse(result),{ok:false,code:'IP_ACCESS_DENIED'});assert.doesNotMatch(result,/sk-fixture|private/);
  message='您无权访问该 API';await assert.rejects(requestSummary(profile,'OK','short',{isTest:true}),e=>e.message==='PERMISSION_DENIED');
  assert.equal(count,4,'no retries');
  console.log('PASS IP restriction vs API permission, safe diagnostics through native runner, shared discovery errors and no retries');
 }finally{server.closeAllConnections();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1});
