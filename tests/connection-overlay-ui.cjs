const fs=require('fs'),assert=require('assert/strict'),vm=require('vm');

async function review(result,options={}){
 const calls=[],chrome={runtime:{getURL:path=>'chrome-extension://test/'+path},windows:{getCurrent:async()=>({id:4}),create:async value=>{calls.push(['popup',value]);return {}}},tabs:{query:async()=>[{id:9}],create:async value=>{calls.push(['tab',value]);return {id:10}}},scripting:{executeScript:async value=>{calls.push(['inject',value]);if(result instanceof Error)throw result;return [{result}]}}};
 const context=vm.createContext({chrome,crypto:{randomUUID:()=> 'token'},OverlayWindowRender:function(){},window:{}});
 vm.runInContext(fs.readFileSync('extension/connection-review.js','utf8'),context);
 return {opened:await context.window.ConnectionReview.open(options),calls};
}

(async()=>{
 const success=await review(true,{guide:true});
 assert.equal(success.opened,true,'a rendered page overlay is reported as opened');
 assert.deepEqual(success.calls.map(call=>call[0]),['inject'],'page overlay is the only opening action');
 assert.equal(success.calls[0][1].target.tabId,9);
 assert.deepEqual(Array.from(success.calls[0][1].args),['chrome-extension://test/connection-window.html?token=token&guide=1','token','connection','判定可用']);

 const restricted=await review(Error('restricted page'));
 assert.equal(restricted.opened,true,'restricted pages open the tool in a tab of the same Chrome window');
 assert.deepEqual(restricted.calls.map(call=>call[0]),['inject','tab'],'restricted pages never create a Chrome popup');
 assert.equal(restricted.calls[1][1].windowId,4);
 assert.match(restricted.calls[1][1].url,/connection-window\.html/);
 const unrendered=await review(false);
 assert.equal(unrendered.opened,true,'failed injection result opens the browser tab fallback');
 assert.deepEqual(unrendered.calls.map(call=>call[0]),['inject','tab']);
 console.log('PASS connection uses page overlay or same-window tab fallback');
})().catch(error=>{console.error(error);process.exitCode=1});
