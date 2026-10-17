const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const nodes={},responses=[];
function node(id){return nodes[id]||=( {value:'',disabled:false,hidden:false,textContent:'',dataset:{},selectedOptions:[{dataset:{quality:''}}],listeners:{},addEventListener(event,fn){this.listeners[event]=fn;},setAttribute(){},querySelectorAll(){return[]},replaceChildren(...items){this.value=String(items[0]?.value||'');this.selectedOptions=items.length?items:this.selectedOptions;}} );}
const context=vm.createContext({
  setTaskListLoading(){},GalleryCards:{render(){return{checks:[],getVisibleIndexes(){return[]},getCount(){return 0},setBusy(){},destroy(){}}}},
  VideoCompanion:{create:()=>({isActive:()=>false,sourceUrl:()=>'',setDisabled(){},hasContent:()=>false,hasUnsubmittedChanges:()=>false,hasChanges:()=>false,reset(){},show(){},selection:()=>({}),markSubmitted(){}})},
  URL,Promise,setTimeout:()=>1,clearTimeout(){},location:{href:'chrome-extension://test/video.html'},document:{getElementById:node,createElement:()=>({dataset:{},append(){},addEventListener(){}})},
  chrome:{windows:{getCurrent:async()=>({id:1})},tabs:{query:async()=>[]},storage:{onChanged:{addListener(){}},session:{get:async()=>({}),set:async()=>{}},local:{get:async()=>({}),set:async()=>{}}},runtime:{sendMessage:async message=>{
    if(message.action==='video-status')return new Promise(resolve=>responses.push(resolve));
    if(message.action==='video-info')return {ok:true,title:'视频',heights:[0],companionAvailable:false};
    if(message.action==='video-jobs')return {ok:true,items:[]};
    return {ok:true};
  }}}
});
(async()=>{
  vm.runInContext(fs.readFileSync('extension/video-url.js','utf8'),context);
  vm.runInContext(fs.readFileSync('extension/video.js','utf8'),context);
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(responses.length,1);
  node('url').value='https://www.xiaohongshu.com/explore/6557c3d40';
  const parsing=node('inspect').listeners.click();
  responses.shift()({ok:true,directory:'F:\\精彩摘录\\精彩摘录视频',cookies:false});
  await parsing;await new Promise(resolve=>setImmediate(resolve));
  assert.equal(node('directoryInput').value,'F:\\精彩摘录\\精彩摘录视频','default save directory must appear after URL normalization');
  console.log('PASS default save directory survives URL normalization');
})().catch(error=>{console.error(error);process.exitCode=1});
