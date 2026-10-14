const fs=require('fs'),assert=require('assert/strict'),vm=require('vm');

(async()=>{
 let nextToken=0,nextWindow=30;
 const windows=[
  {id:20,type:'popup',tabs:[{url:'chrome-extension://test/ocr-review.html?token=old'}]},
  {id:21,type:'popup',tabs:[{url:'https://example.com/other'}]}
 ];
 const removed=[];
 class Channel {
  static instances=[];
  constructor(){Channel.instances.push(this)}
  postMessage(){}
  close(){}
 }
 const context=vm.createContext({
  window:{},crypto:{randomUUID:()=>`token-${++nextToken}`},BroadcastChannel:Channel,setTimeout,clearTimeout,
  chrome:{runtime:{getURL:name=>'chrome-extension://test/'+name},windows:{
   getCurrent:async()=>({id:7,width:1400,height:900,left:0,top:0}),
   getAll:async()=>windows,
   remove:async id=>{removed.push(id);windows.splice(windows.findIndex(item=>item.id===id),1)},
   create:async options=>{const result={id:++nextWindow,type:'popup',tabs:[{url:options.url}]};windows.push(result);queueMicrotask(()=>Channel.instances.at(-1).onmessage({data:'received'}));return result}
  },tabs:{query:async()=>[{id:5,url:'https://example.com/page'}]},scripting:{executeScript:async()=>{throw Error('page blocked')}}}
 });
 vm.runInContext(fs.readFileSync('extension/capture-review.js','utf8'),context);
 const snapshot={png:'data:image/png;base64,AA==',sourceUrl:'https://example.com/page'};
 await context.window.CaptureReview.open(snapshot);
 assert.deepEqual(removed,[20],'an older OCR popup should close before showing a new review');
 assert.equal(windows.filter(item=>item.tabs[0].url.startsWith('chrome-extension://test/ocr-review.html')).length,1);
 await context.window.CaptureReview.open(snapshot);
 assert.deepEqual(removed,[20,31],'the previous fallback popup should close on the next capture');
 assert.ok(windows.some(item=>item.id===21),'unrelated browser popups must stay open');
 console.log('PASS only the latest OCR fallback popup remains');
})().catch(error=>{console.error(error);process.exitCode=1});
