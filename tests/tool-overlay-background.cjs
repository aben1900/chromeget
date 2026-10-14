const assert=require('assert/strict'),fs=require('fs'),vm=require('vm'),{webcrypto}=require('crypto');
let handler,click,failInjection=false,activeTab={id:41,windowId:7,url:'https://example.test/page'};
const local={},session={},injections=[],tabsOpened=[],nativeCalls=[],noop=()=>{},url=path=>'chrome-extension://test/'+path;
const chrome={
 runtime:{id:'test',getURL:url,onMessage:{addListener:fn=>handler=fn},onInstalled:{addListener:noop},onStartup:{addListener:noop},sendNativeMessage(_host,message,reply){nativeCalls.push(message);reply(message.action==='status'?{ok:true,capabilities:['ai-config-models-v2','ai-translation-v1','free-translation-native-v1']}:{ok:true});}},
 storage:{local:{get:async()=>local,set:async value=>Object.assign(local,value)},session:{get:async keys=>typeof keys==='string'?{[keys]:session[keys]}:session,set:async value=>Object.assign(session,value),remove:async keys=>{for(const key of Array.isArray(keys)?keys:[keys])delete session[key];}}},
 action:{onClicked:{addListener:noop},setTitle:async()=>{},setBadgeText:async()=>{},setBadgeBackgroundColor:async()=>{}},contextMenus:{onClicked:{addListener:fn=>click=fn}},windows:{onRemoved:{addListener:noop},create:async()=>{throw Error('Chrome popup must not open');}},
 tabs:{query:async()=>[activeTab],create:async options=>{tabsOpened.push(options);return {id:72,...options}}},
 scripting:{executeScript:async options=>{if(failInjection)throw Error('not scriptable');injections.push(options);return [{result:true}];}}
};
const channelMessages=[];
class BroadcastChannel{constructor(){this.onmessage=null}postMessage(data){channelMessages.push(data);if(data.type==='prepare')setTimeout(()=>this.onmessage?.({data:{type:'ready',token:data.token}}),0)}close(){}}
const ctx=vm.createContext({chrome,console,URL,crypto:webcrypto,setTimeout,clearTimeout,AbortController,BroadcastChannel,fetch:async()=>({ok:true,json:async()=>[]}),OverlayWindowRender(){}});
ctx.importScripts=(...names)=>names.forEach(name=>{if(name!=='window-overlay.js')vm.runInContext(fs.readFileSync('extension/'+name,'utf8'),ctx)});
vm.runInContext(fs.readFileSync('extension/background.js','utf8'),ctx);
function send(message,sender={id:'test',url:url('app.html'),frameId:-1}){return new Promise((resolve,reject)=>{if(handler(message,sender,resolve)!==true)reject(Error('message rejected'));});}
async function waitFor(predicate){for(let i=0;i<100&&!predicate();i++)await new Promise(resolve=>setTimeout(resolve,5));assert.ok(predicate(),'timed out waiting for overlay action');}
(async()=>{
 const opened=await send({action:'open-tool-overlay',tool:'model'});
 assert.equal(opened.ok,true);
 assert.equal(injections.length,1);
 assert.equal(injections[0].target.tabId,41);
 assert.equal(injections[0].target.frameIds.join(','),'0');
 const [modelUrl,modelToken,modelTool,modelTitle]=injections[0].args;
 assert.equal(modelUrl,url('model-settings.html?overlay='+modelToken));
 assert.equal(modelTool,'model');assert.equal(modelTitle,'模型设置');
 assert.equal(session['tool-overlay:'+modelToken].tabId,41);
 assert.equal(session['tool-overlay:'+modelToken].tool,'model');
 assert.equal(session['tool-overlay:'+modelToken].page,'model-settings.html');
 assert.equal(tabsOpened.length,0);
 const modelSender={id:'test',url:modelUrl,frameId:2,tab:{id:41,windowId:7}};
 assert.equal((await send({action:'ai-settings-get'},modelSender)).ok,true);
 assert.equal((await send({action:'ai-settings-save'},modelSender)).ok,true);
 for(const bad of [
  {...modelSender,url:url('model-settings.html?overlay=fake')},
  {...modelSender,tab:{id:99,windowId:7}},
  {...modelSender,url:url('translate.html?overlay='+modelToken)}
 ])assert.equal((await send({action:'ai-settings-get'},bad)).ok,false,'untrusted iframe must be denied');
 session['tool-overlay:'+modelToken].expiresAt=Date.now()-1;
 assert.equal((await send({action:'ai-settings-get'},modelSender)).ok,false,'expired token must be denied');
 assert.equal((await send({action:'close-tool-overlay',token:modelToken},{id:'test',url:'https://example.test/page',tab:{id:41,windowId:7},frameId:0})).ok,true);
 assert.equal(session['tool-overlay:'+modelToken],undefined);
 assert.equal((await send({action:'ai-settings-get'},modelSender)).ok,false,'closed overlay must remain denied');
 const tr=await send({action:'open-tool-overlay',tool:'translate',translationId:'selected-id'});
 assert.equal(tr.ok,true);
 const [trUrl,trToken]=injections.at(-1).args;
 assert.equal(trUrl,url('translate.html?overlay='+trToken+'&id=selected-id'));
 const trSender={id:'test',url:trUrl,frameId:3,tab:{id:41,windowId:7}};
 assert.equal((await send({action:'ai-translate'},trSender)).ok,true);
 assert.equal((await send({action:'free-translate',route:'bilibili',text:'hello'},trSender)).ok,true);
 assert.equal((await send({action:'ai-translate'},{...trSender,tab:{id:12,windowId:7}})).ok,false);
 const priorInjectionCount=injections.length;
 const libraryTab={id:60,windowId:7,url:url('library.html')};
 const direct=await send({action:'open-tool-overlay',tool:'model'},{id:'test',url:url('library.html'),frameId:0,tab:libraryTab});
 assert.equal(direct.ok,true);
 assert.equal(direct.render.tool,'model','same-origin extension tab renders without script injection');
 assert.equal(injections.length,priorInjectionCount);
 assert.equal((await send({action:'ai-settings-get'},{id:'test',url:direct.render.url,frameId:2,tab:libraryTab})).ok,true);
 assert.equal((await send({action:'close-tool-overlay',token:direct.render.token},{id:'test',url:url('library.html'),frameId:0,tab:libraryTab})).ok,true);
 activeTab=libraryTab;
 const sidebarOpen=await send({action:'open-tool-overlay',tool:'translate'});
 assert.equal(sidebarOpen.ok,true,'sidebar should open directly inside an active extension tab');
 assert.equal(channelMessages.at(-2).type,'prepare');
 assert.equal(channelMessages.at(-1).type,'commit');
 assert.equal(tabsOpened.length,0);
 assert.equal(injections.length,priorInjectionCount);
 activeTab={id:41,windowId:7,url:'https://example.test/page'};
 failInjection=true;
 const fallback=await send({action:'open-tool-overlay',tool:'model'});
 assert.equal(fallback.fallback,'tab');
 assert.equal(tabsOpened.at(-1).url,url('model-settings.html'));
 assert.equal(tabsOpened.at(-1).windowId,7);
 assert.equal((await send({action:'ai-settings-get'},{id:'test',url:url('model-settings.html'),frameId:0})).ok,true,'top-level extension page keeps access');
 failInjection=false;
 click({menuItemId:'translate',selectionText:'Hello <script>'},{id:58,windowId:7,url:'https://example.test/page'});
 await waitFor(()=>injections.length===3);
 const [contextUrl]=injections.at(-1).args;
 const selectionId=new URL(contextUrl).searchParams.get('id');
 assert.equal(session['translation:'+selectionId].text,'Hello <script>');
 assert.equal(tabsOpened.length,1);
 console.log('PASS token-bound browser overlays, iframe AI/translation access, revocation, tab fallback, and selected-text context entry');
})().catch(error=>{console.error(error);process.exitCode=1});
