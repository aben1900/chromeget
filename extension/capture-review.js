(() => {
 function overlay(url,token){
  for(const old of document.querySelectorAll('[data-chromeget-ocr-review]')){old.dispatchEvent(new Event('chromeget-ocr-dispose'));old.remove()}
  const host=document.createElement('div');host.dataset.chromegetOcrReview=token;const shadow=host.attachShadow({mode:'closed'}),sheet=new CSSStyleSheet();sheet.replaceSync('dialog{box-sizing:border-box;width:min(1200px,calc(100vw - 32px));height:min(850px,calc(100vh - 32px));max-width:none;max-height:none;padding:0;border:1px solid #ddd;border-radius:12px;overflow:hidden;background:#fff}dialog::backdrop{background:#0006}iframe{display:block;width:100%;height:100%;border:0}');shadow.adoptedStyleSheets=[sheet];const dialog=document.createElement('dialog'),frame=document.createElement('iframe');frame.src=url;frame.title='截图文字待确认';dialog.append(frame);shadow.append(dialog);document.documentElement.append(host);dialog.showModal();
  function close(){window.removeEventListener('message',message);host.remove()}
  host.addEventListener('chromeget-ocr-dispose',close,{once:true});
  function message(event){if(event.source!==frame.contentWindow||event.data?.token!==token)return;if(event.data.type==='chromeget-ocr-close')close();if(event.data.type==='chromeget-ocr-visibility'){if(event.data.visible){if(!dialog.open)dialog.showModal()}else if(dialog.open)dialog.close();const acknowledge=()=>frame.contentWindow.postMessage({type:'chromeget-ocr-visibility-done',token,visible:event.data.visible},'*');if(event.data.visible)acknowledge();else requestAnimationFrame(()=>requestAnimationFrame(acknowledge))}}
  window.addEventListener('message',message);dialog.addEventListener('cancel',e=>{e.preventDefault();close()});return true;
 }
 window.CaptureReview={async open(snapshot){
  const origin=await chrome.windows.getCurrent(),token=crypto.randomUUID(),channel=new BroadcastChannel('chromeget-ocr:'+token);let received=false,ack;
  if(chrome.windows.getAll&&chrome.windows.remove){
   const reviewUrl=chrome.runtime.getURL('ocr-review.html')+'?token=';
   try{for(const old of await chrome.windows.getAll({populate:true,windowTypes:['popup']})){
    if(old.type==='popup'&&old.tabs?.some(tab=>(tab.pendingUrl||tab.url||'').startsWith(reviewUrl)))await chrome.windows.remove(old.id).catch(()=>{});
   }}catch{}
  }
  const ready=new Promise(resolve=>ack=resolve);
  const timer=setTimeout(()=>channel.close(),60000);
  channel.onmessage=event=>{if(event.data==='ready')channel.postMessage({snapshot,originWindowId:origin.id});if(event.data==='received'){received=true;ack(true);clearTimeout(timer);channel.close()}};
  const url=chrome.runtime.getURL('ocr-review.html')+'?token='+encodeURIComponent(token)+'&originWindowId='+origin.id;
  try{const [tab]=await chrome.tabs.query({active:true,windowId:origin.id});if(tab?.url===snapshot.sourceUrl){await chrome.scripting.executeScript({target:{tabId:tab.id,frameIds:[0]},func:overlay,args:[url+'&embedded=1',token]});let wait;const loaded=await Promise.race([ready,new Promise(resolve=>{wait=setTimeout(()=>resolve(false),2500)})]);clearTimeout(wait);if(loaded)return;await chrome.scripting.executeScript({target:{tabId:tab.id},func:token=>document.querySelector('[data-chromeget-ocr-review="'+token+'"]')?.remove(),args:[token]});}}catch{}
  if(received)return;
  try{const width=Math.min(1200,origin.width),height=Math.min(850,origin.height);await chrome.windows.create({url,type:'popup',width,height,left:Math.round(origin.left+(origin.width-width)/2),top:Math.round(origin.top+(origin.height-height)/2)});}catch(e){clearTimeout(timer);channel.close();throw e;}
 }};
})();
