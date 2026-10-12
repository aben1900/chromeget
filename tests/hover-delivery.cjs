const fs=require('fs'),vm=require('vm'),assert=require('assert/strict'),{randomUUID}=require('crypto');
const source=fs.readFileSync('extension/background.js','utf8'),start=source.indexOf("  if(message.action==='page-video-download'"),end=source.indexOf('\n  if (sender.id',start);
async function run(receipt){
 const data={};let opened=false;
 const chrome={runtime:{id:'test'},sidePanel:{open:async()=>{opened=true;}},storage:{local:{get:async()=>({hoverDownloadEnabled:true})},session:{set:async values=>{assert(opened);Object.assign(data,values);const request=data['hover-request:7'];if(request&&receipt)data['hover-receipt:7']={id:request.id,...receipt};},get:async key=>({[key]:data[key]})}}};
 const context=vm.createContext({chrome,URL,crypto:{randomUUID},setTimeout:f=>setImmediate(f)});vm.runInContext(fs.readFileSync('extension/video-url.js','utf8'),context);
 const handle=vm.runInContext('(function(message,sender,reply){'+source.slice(start,end)+'})',context);
 const result=await new Promise(resolve=>handle({action:'page-video-download',mediaUrl:'blob:video'},{id:'test',url:'https://www.bilibili.com/video/BV1uzpY6NEe1/',tab:{windowId:7}},resolve));return {result,data};
}
(async()=>{const success=await run({ok:true});assert.equal(success.result.ok,true);assert.equal(success.data['app-view:7'],'video');assert(success.data['hover-request:7'].id);assert.equal((await run(null)).result.ok,false,'storage write alone must not report success');assert.match((await run({ok:false,error:'侧栏忙碌'})).result.error,/忙碌/);console.log('PASS hover handoff requires matching receipt, reports busy/timeout, opens panel before awaits');})().catch(e=>{console.error(e);process.exitCode=1});
