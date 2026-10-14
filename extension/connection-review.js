(() => {
 window.ConnectionReview={async open(options={}){
  let origin;
  try{
   origin=await chrome.windows.getCurrent();
   const [tab]=await chrome.tabs.query({active:true,windowId:origin.id});
   if(Number.isInteger(tab?.id)&&tab.url?.startsWith(chrome.runtime.getURL(''))&&typeof BroadcastChannel!=='undefined'){
    const token=crypto.randomUUID(),channel=new BroadcastChannel('chromeget-connection-overlay');
    let timer;
    const ready=new Promise(resolve=>{channel.onmessage=event=>{if(event.data?.type==='ready'&&event.data.token===token)resolve(true)};timer=setTimeout(()=>resolve(false),900)});
    channel.postMessage({type:'prepare',tabId:tab.id,token,guide:!!options.guide});
    const confirmed=await ready;clearTimeout(timer);
    if(confirmed){channel.postMessage({type:'commit',token});channel.close();return true}
    channel.close();
   }
   if(Number.isInteger(tab?.id)&&chrome.scripting?.executeScript&&typeof OverlayWindowRender==='function'){
    const token=crypto.randomUUID(),url=chrome.runtime.getURL('connection-window.html')+'?token='+encodeURIComponent(token)+(options.guide?'&guide=1':'');
    const results=await chrome.scripting.executeScript({target:{tabId:tab.id,frameIds:[0]},func:OverlayWindowRender,args:[url,token,'connection','判定可用']});
    if(results?.some(entry=>entry?.result===true))return true;
   }
  }catch{}
  try{
   await chrome.tabs.create({url:chrome.runtime.getURL('connection-window.html')+(options.guide?'?guide=1':''),...(Number.isInteger(origin?.id)?{windowId:origin.id}:{})});
   return true;
  }catch{return false}
 }};
})();
