(() => {
 function overlay(url,token){
  for(const old of document.querySelectorAll('[data-chromeget-screenshot-review]'))old.remove();
  const host=document.createElement('div');host.dataset.chromegetScreenshotReview=token;
  const shadow=host.attachShadow({mode:'closed'}),sheet=new CSSStyleSheet();
  sheet.replaceSync('dialog{box-sizing:border-box;width:min(1200px,calc(100vw - 32px));height:min(850px,calc(100vh - 32px));max-width:none;max-height:none;padding:0;border:1px solid #d8dee8;border-radius:12px;overflow:hidden;background:#f7f9fc;color:#29364b;box-shadow:0 18px 60px #0005}dialog::backdrop{background:#0006}iframe{display:block;width:100%;height:100%;border:0}');shadow.adoptedStyleSheets=[sheet];
  const dialog=document.createElement('dialog'),frame=document.createElement('iframe');frame.src=url;frame.title='截图确认';dialog.append(frame);shadow.append(dialog);document.documentElement.append(host);dialog.showModal();
  function close(){window.removeEventListener('message',message);host.remove()}
  function message(event){if(event.data?.type!=='chromeget-screenshot-overlay-close'||event.data?.token!==token)return;close()}
  window.addEventListener('message',message);dialog.addEventListener('cancel',event=>{event.preventDefault();frame.contentWindow.postMessage({type:'chromeget-screenshot-overlay-close',token},'*');close()});
  host.addEventListener('chromeget-screenshot-dispose',close,{once:true});return true;
 }
 window.ScreenshotConfirm={async open(snapshot,options={}){
  if(!snapshot?.png||typeof snapshot.png!=='string')throw Error('截图内容无效，请重新截图。');
  const origin=await chrome.windows.getCurrent(),token=crypto.randomUUID(),channel=new BroadcastChannel('chromeget-screenshot-review:'+token);let resolve,readyResolve,finished=false,overlayTabId=null,popupWindowId=null;
  const completion=new Promise(done=>resolve=done),ready=new Promise(done=>readyResolve=done);let readyHandled=false;
  const url=chrome.runtime.getURL('screenshot-review.html')+'?token='+encodeURIComponent(token);
  const reviewOptions={mode:options.mode==='gallery'?'gallery':'home',directory:options.directory||'',name:options.name||'',confirmLabel:options.confirmLabel||'确认截图',sourceTitle:snapshot.sourceTitle||''};
  const removeOverlay=async()=>{if(overlayTabId==null)return;const tabId=overlayTabId;overlayTabId=null;await chrome.scripting.executeScript({target:{tabId},func:id=>{const host=document.querySelector('[data-chromeget-screenshot-review="'+CSS.escape(id)+'"]');host?.dispatchEvent(new Event('chromeget-screenshot-dispose'));host?.remove()},args:[token]}).catch(()=>{})};
  const finish=async result=>{if(finished)return;finished=true;clearTimeout(timeout);chrome.windows.onRemoved?.removeListener?.(onWindowRemoved);window.removeEventListener('message',onOverlayMessage);await removeOverlay();channel.close();if(popupWindowId!=null)chrome.windows.remove(popupWindowId).catch(()=>{});resolve(result)};
  const onWindowRemoved=id=>{if(id===popupWindowId)finish({action:'close'})};
  const onOverlayMessage=event=>{if(event.data?.type==='chromeget-screenshot-overlay-close'&&event.data?.token===token)finish({action:'close'})};
  const timeout=setTimeout(()=>finish({action:'close'}),30*60*1000);
  chrome.windows.onRemoved?.addListener?.(onWindowRemoved);window.addEventListener('message',onOverlayMessage);
  channel.onmessage=async event=>{
   const data=event.data||{};
   if(data.type==='ready'){
    if(readyHandled)return;readyHandled=true;channel.postMessage({type:'init',snapshot,options:reviewOptions});readyResolve(true);return;
   }
   if(data.type==='close'){finish({action:'close'});return}
   if(data.type==='retake'){finish({action:'retake'});return}
   if(data.type==='confirm'){finish({action:'confirm'});return}
   if(data.type==='choose-directory'){
    try{const result=await options.onChooseDirectory?.(data.directory||reviewOptions.directory);channel.postMessage({type:'directory-result',...(result||{cancelled:true})})}
    catch(error){channel.postMessage({type:'directory-result',error:error?.message||'选择目录失败'})}
    return;
   }
   if(data.type==='save'){
    try{if(typeof options.onSave!=='function')throw Error('当前页面暂不支持保存截图。');const result=await options.onSave({name:data.name,directory:data.directory});channel.postMessage({type:'save-result',ok:true,path:result?.path||''})}
    catch(error){channel.postMessage({type:'save-result',ok:false,error:error?.message||'保存失败'})}
    return;
   }
   if(data.type==='save-complete'){finish({action:'saved',path:data.path||''});return}
   if(data.type==='closed')finish({action:'close'});
  };
  try{
   const [tab]=await chrome.tabs.query({active:true,windowId:origin.id});
   if(tab?.id&&tab.url===snapshot.sourceUrl&&/^https?:/i.test(tab.url)){
    try{const injected=await chrome.scripting.executeScript({target:{tabId:tab.id,frameIds:[0]},func:overlay,args:[url+'&embedded=1',token]});if(injected?.[0]?.result===true){overlayTabId=tab.id;let wait;const loaded=await Promise.race([ready,new Promise(done=>{wait=setTimeout(()=>done(false),2500)})]);clearTimeout(wait);if(loaded)return completion;await removeOverlay();}}
    catch{await removeOverlay()}
   }
   const width=Math.min(1200,Math.max(480,origin.width-32)),height=Math.min(850,Math.max(480,origin.height-32));
   const popup=await chrome.windows.create({url,type:'popup',width,height,left:Math.round(origin.left+(origin.width-width)/2),top:Math.round(origin.top+(origin.height-height)/2)});popupWindowId=popup?.id??null;
   return completion;
  }catch(error){finish({action:'error',error:error?.message||'无法打开截图确认窗口'});throw error;}
 }};
})();
