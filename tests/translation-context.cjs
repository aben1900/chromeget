const assert=require('assert/strict'),fs=require('fs'),vm=require('vm'),{webcrypto}=require('crypto');
let click,handler;
const store={},injected=[],newTabs=[],native=[],noop=()=>{},url=path=>'chrome-extension://test/'+path;
const chrome={
 runtime:{id:'test',getURL:url,onMessage:{addListener:fn=>handler=fn},onInstalled:{addListener:noop},onStartup:{addListener:noop},sendNativeMessage(_host,message,callback){native.push(message);callback({ok:true,capabilities:['ai-translation-v1','free-translation-native-v1']});}},
 windows:{onRemoved:{addListener:noop},create:async()=>{throw Error('unexpected popup window');}},
 tabs:{query:async()=>[{id:44,windowId:3,url:'https://example.test'}],create:async options=>newTabs.push(options)},
 scripting:{executeScript:async options=>{injected.push(options);return [{result:true}]}},
 action:{onClicked:{addListener:noop},setTitle:async()=>{}},contextMenus:{onClicked:{addListener:fn=>click=fn}},
 storage:{session:{get:async key=>typeof key==='string'?{[key]:store[key]}:store,set:async value=>Object.assign(store,value),remove:async key=>delete store[key]}}
};
const ctx=vm.createContext({chrome,crypto:webcrypto,console,URL,setTimeout,clearTimeout,AbortController,fetch:async()=>({ok:true,json:async()=>[{translations:[{text:'你好'}]}]}),OverlayWindowRender(){}});
ctx.importScripts=(...names)=>names.forEach(name=>{if(name!=='window-overlay.js')vm.runInContext(fs.readFileSync('extension/'+name,'utf8'),ctx)});
vm.runInContext(fs.readFileSync('extension/background.js','utf8'),ctx);
async function send(message,sender){return new Promise((resolve,reject)=>{if(handler(message,sender,resolve)!==true)reject(Error('message rejected'));});}
(async()=>{
 click({menuItemId:'translate',selectionText:'Hello <script>'},{id:44,windowId:3,url:'https://example.test'});
 for(let i=0;i<100&&!injected.length;i++)await new Promise(resolve=>setTimeout(resolve,5));
 assert.equal(injected.length,1);
 assert.equal(injected[0].target.tabId,44);
 const [page,token,tool]=injected[0].args;
 assert.equal(tool,'translate');
 assert.equal(page,url('translate.html?overlay='+token+'&id='+new URL(page).searchParams.get('id')));
 assert.equal(store['translation:'+new URL(page).searchParams.get('id')].text,'Hello <script>');
 assert.equal(newTabs.length,0);
 assert.equal(native.length,0);
 const sender={id:'test',url:page,frameId:2,tab:{id:44,windowId:3}};
 assert.equal((await send({action:'ai-translate'},sender)).ok,true);
 assert.notEqual(handler({action:'ai-translate'},{id:'test',url:'https://example.test',frameId:0},noop),true);
 assert.notEqual(handler({action:'ai-translate'},{id:'test',url:url('library.html'),frameId:0},noop),true);
 const free=await send({action:'free-translate',text:'Hello',sourceLanguage:'auto',targetLanguage:'zh'},sender);
 assert.equal(free.text,'你好');
 const before=native.length;
 await send({action:'free-translate',route:'bilibili',text:'Hello',sourceLanguage:'en',targetLanguage:'zh'},sender);
 assert.equal(native[before].action,'status');
 assert.equal(native[before+1].action,'ai-free-translate');
 console.log('PASS selected text opens browser overlay, translation routing remains authorized');
})().catch(error=>{console.error(error);process.exitCode=1});
