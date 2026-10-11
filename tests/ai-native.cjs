'use strict';
const fs=require('fs'),path=require('path'),assert=require('assert/strict'),http=require('http'),{spawn}=require('child_process'),{randomUUID}=require('crypto');
const root=path.resolve('work/ai-native-'+Date.now());fs.mkdirSync(root,{recursive:true});
for(const n of fs.readdirSync('native').filter(n=>/\.(ps1|cjs)$/.test(n)))fs.copyFileSync('native/'+n,path.join(root,n));fs.writeFileSync(path.join(root,'config.json'),JSON.stringify({directory:root}));
function send(message,onSpawn){return new Promise((resolve,reject)=>{const p=spawn('powershell.exe',['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',path.join(root,'host.ps1')],{windowsHide:true});if(onSpawn)onSpawn(p);const out=[];p.stdout.on('data',b=>out.push(b));p.on('error',reject);p.on('close',()=>{try{resolve(JSON.parse(Buffer.concat(out).subarray(4)))}catch(e){reject(e)}});const b=Buffer.from(JSON.stringify(message)),h=Buffer.alloc(4);h.writeUInt32LE(b.length);p.stdin.end(Buffer.concat([h,b]));});}
(async()=>{
 const defaults=await send({action:'ai-settings-get'});assert.equal(defaults.ok,true,JSON.stringify(defaults));assert.equal(defaults.profiles.deepseek.model,'deepseek-flash');
 let release,received;let count=0;const arrived=new Promise(r=>received=r);const server=http.createServer((req,res)=>{count++;req.resume();req.on('end',()=>{release=()=>res.end(JSON.stringify({status:'completed',output:[{type:'message',content:[{type:'output_text',text:'生成摘要'}]}]}));received();});});await new Promise(r=>server.listen(0,'127.0.0.1',r));
 try{
  const settings=await send({action:'ai-settings-save',profileId:'openai',expectedRevision:defaults.profiles.openai.revision,baseUrl:'http://127.0.0.1:'+server.address().port,key:'sk-fixture-only'});assert.equal(settings.ok,true,JSON.stringify(settings));assert.ok(!JSON.stringify(settings).includes('sk-fixture-only'));
  assert.equal((await send({action:'ai-prepare',id:'clip:missing',length:'short'})).code,'DEFAULT_MODEL_REQUIRED');
  const d=await send({action:'ai-default-set',profileId:'openai',expectedSelectionRevision:settings.selectionRevision});assert.equal(d.ok,true);
  const id=randomUUID();assert.equal((await send({action:'save',record:{id,time:new Date().toISOString(),type:'内容',content:'原文'}})).ok,true);
  const p=await send({action:'ai-prepare',id:'clip:'+id,profileId:'openai',length:'standard'});assert.equal(p.ok,true,JSON.stringify(p));
  const other=await send({action:'ai-settings-save',label:'Other',provider:'custom',protocol:'chat-completions',baseUrl:'https://example.test',model:'other',auth:'bearer',key:'sk-fixture'});
  const switched=await send({action:'ai-default-set',profileId:other.profileId,expectedSelectionRevision:d.selectionRevision});
  assert.equal((await send({action:'ai-generate',requestId:p.requestId,confirmed:true})).code,'CONFIG_CHANGED');
  const restored=await send({action:'ai-default-set',profileId:'openai',expectedSelectionRevision:switched.selectionRevision});
  const fresh=await send({action:'ai-prepare',id:'clip:'+id,profileId:'openai',length:'standard'});Object.assign(p,fresh);
  const first=send({action:'ai-generate',requestId:p.requestId,confirmed:true});await Promise.race([arrived,new Promise((_,reject)=>{const t=setTimeout(()=>reject(Error('request did not arrive')),12000);t.unref();})]);
  assert.equal((await send({action:'save',record:{id:randomUUID(),time:new Date().toISOString(),type:'内容',content:'生成时并发保存'}})).ok,true);
  assert.equal((await send({action:'ai-generate',requestId:p.requestId,confirmed:true})).state,'running');assert.equal(count,1);release();const result=await first;assert.equal(result.text,'生成摘要');assert.ok(!result.executionToken);
  assert.equal((await send({action:'ai-generate',requestId:p.requestId,confirmed:true})).state,'completed');assert.equal(count,1);
  assert.equal((await send({action:'ai-save',requestId:p.requestId,text:result.text,expectedSummaryRevision:null})).ok,true);
  assert.equal((await send({action:'ai-read',id:'clip:'+id})).summary.text,'生成摘要');
  const interruptedPlan=await send({action:'ai-prepare',id:'clip:'+id,profileId:'openai',length:'standard'});const secondArrived=new Promise(r=>received=r);let killed;
  const interrupted=send({action:'ai-generate',requestId:interruptedPlan.requestId,confirmed:true},p=>killed=p).catch(()=>null);await secondArrived;killed.kill();release();await interrupted;
  const jobRoot=path.join(root,'ai-jobs');const job=path.join(jobRoot,fs.readdirSync(jobRoot)[0],interruptedPlan.requestId+'.json');const state=JSON.parse(fs.readFileSync(job));assert.equal(state.state,'running');state.startedAt=Date.now()-91000;fs.writeFileSync(job,JSON.stringify(state));
  assert.equal((await send({action:'ai-status',requestId:interruptedPlan.requestId})).state,'unknown');assert.equal((await send({action:'ai-generate',requestId:interruptedPlan.requestId,confirmed:true})).state,'unknown');assert.equal(count,2);
  let nextArrival=new Promise(r=>received=r);const testing=send({action:'ai-test',profileId:'openai',model:settings.profiles.openai.model,confirmed:true});await nextArrival;release();assert.equal((await testing).ok,true);
  const before=await send({action:'ai-settings-get'});const alternate=await send({action:'ai-default-set',profileId:other.profileId,expectedSelectionRevision:before.selectionRevision});assert.equal(alternate.ok,true);
  const temporary=await send({action:'ai-prepare',id:'clip:'+id,profileId:'openai',model:settings.profiles.openai.model,temporary:true,length:'short'});assert.equal(temporary.ok,true,JSON.stringify(temporary));nextArrival=new Promise(r=>received=r);const generated=send({action:'ai-generate',requestId:temporary.requestId,confirmed:true});await nextArrival;release();assert.equal((await generated).text,'生成摘要');assert.equal((await send({action:'ai-settings-get'})).defaultProfileId,other.profileId);
  console.log('PASS temporary cross-profile generation preserves default; real native AI bridge: DPAPI, concurrent collection, deduplication and summary save');
 }finally{server.closeAllConnections();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1});
