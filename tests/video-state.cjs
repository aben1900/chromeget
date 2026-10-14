const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const nodes={},timers=new Map(),filters=[];let timerId=0,stall=false;
function node(id){return nodes[id] ||= {value:'',disabled:false,textContent:'',dataset:{},selectedOptions:[{dataset:{quality:''}}],listeners:{},addEventListener(event,fn){this.listeners[event]=fn;},setAttribute(){},querySelectorAll(){return []},replaceChildren(...items){this.value=String(items[0]?.value||'');this.selectedOptions=items.length?items:this.selectedOptions;}};}
const context=vm.createContext({setTaskListLoading(){},GalleryCards:{render(){return {checks:[],getVisibleIndexes(){return []},getCount(){return 0},setBusy(){},destroy(){}}}},URL,Promise,location:{href:'chrome-extension://test/video.html'},supportedVideoUrl:v=>v,videoSite:()=>'bilibili',currentBiliVideo:async()=>'',setTimeout:(fn,ms)=>{timers.set(++timerId,{fn,ms});return timerId;},clearTimeout:id=>timers.delete(id),document:{getElementById:node,createElement:()=>({dataset:{},append(){},addEventListener(){}})},chrome:{windows:{getCurrent:async()=>({id:1})},storage:{onChanged:{addListener:()=>{}},session:{get:async()=>({}),set:async()=>{}},local:{get:async()=>({lastVideoJob:'old-job'}),set:async()=>{}}},runtime:{getManifest:()=>({version:'1.6.0'}),sendMessage:async message=>{
 if(message.action==='video-browser-cookies')return {ok:true};
 if(message.action==='video-status')return {ok:true,directory:'E:\\video',hostVersion:'1.5.3'};
 if(message.action==='video-jobs'){filters.push(message);return {ok:true,items:[{id:'old-job',state:'running',title:'Background task'}]};}
 if(message.action==='video-job')return {ok:true,state:'running'};
 if(message.action==='video-info'){if(stall)return new Promise(()=>{});return {ok:true,title:'Test',heights:[720,360]};}
 throw Error(message.action);
}}}});
(async()=>{
 vm.runInContext(fs.readFileSync(path.join(__dirname,'../extension/video-url.js'),'utf8'),context);
 vm.runInContext(fs.readFileSync(path.join(__dirname,'../extension/video.js'),'utf8'),context);
 await new Promise(r=>setImmediate(r));
 assert.equal(node('inspect').disabled,false,'restored running task must not lock form');
 node('url').value='https://www.bilibili.com/video/BV123/';
 await node('inspect').listeners.click();
 const statusBefore=node('status').textContent;await context.poll();assert.equal(node('status').textContent,statusBefore,'background refresh must not overwrite parsing status');
 assert.equal(node('download').disabled,false);assert.equal(node('download').textContent,'开始下载');assert.equal(node('title').textContent,'Test');assert.equal(node('website').textContent,'B站');
 await node('browserCookies').listeners.click();assert.equal(node('height').value,'720');assert.equal(node('download').disabled,false);
 stall=true;const pending=node('inspect').listeners.click();await new Promise(r=>setImmediate(r));
 const timeout=[...timers.values()].find(t=>t.ms===110000);assert.ok(timeout);timeout.fn();await pending;
 assert.equal(node('inspect').disabled,false);assert.ok(node('error').textContent.includes('超时'));
 context.chrome.tabs={query:async()=>[{url:'https://www.youtube.com/watch?v=test'}]};
 await node('extractUrl').listeners.click();assert.equal(node('url').value,'https://www.youtube.com/watch?v=test');assert.ok(node('website').textContent.includes('YouTube'));assert.equal(node('title').textContent,'');assert.equal(node('download').disabled,true);
 assert.equal(filters[0].statusFilter,'unfinished');node('taskFilter').value='completed';node('taskFilter').listeners.change();await new Promise(r=>setImmediate(r));assert.equal(filters.at(-1).statusFilter,'completed');assert.equal(filters.at(-1).offset,0);
 console.log('PASS restored-running-task form recovery, parse enables download, request timeout unlocks controls');
})().catch(error=>{console.error(error);process.exitCode=1;});
