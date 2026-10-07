// Capture only after explicit manual capture or the browser video feature is enabled.
let autoSniffEnabled=false;
chrome.storage.local?.get('hoverDownloadEnabled').then(d=>autoSniffEnabled=!!d.hoverDownloadEnabled);
chrome.storage.onChanged?.addListener((changes,area)=>{if(area==='local'&&changes.hoverDownloadEnabled)autoSniffEnabled=!!changes.hoverDownloadEnabled.newValue;});
let sniffSerial = Promise.resolve();
function sniffQueue(fn) { const p=sniffSerial.then(fn); sniffSerial=p.catch(()=>{}); return p; }
function mediaKind(url, type='') {
  try {
    const u=new URL(url);if(!['https:','http:'].includes(u.protocol)||u.username||u.password)return '';
    if(/\.(ts|m4s)(?:$|\?)/i.test(u.pathname))return '';
    if(/\.(m3u8|mpd)$/i.test(u.pathname)||/mpegurl|dash\+xml/i.test(type))return 'manifest';
    if(/^(video|audio)\//i.test(type)||/\.(mp4|webm|m4a|mp3|ogg|mov|wav)$/i.test(u.pathname))return 'file';
  }catch{}return '';
}
chrome.webRequest?.onHeadersReceived.addListener(details=>{
  if(details.tabId<0 || details.statusCode<200 || details.statusCode>=300)return;
  const type=details.responseHeaders?.find(h=>h.name.toLowerCase()==='content-type')?.value || '';
  const kind=mediaKind(details.url,type);if(!kind)return;
  sniffQueue(async()=>{
    const key=`sniff:${details.tabId}`;let state=(await chrome.storage.session.get(key))[key];
    if(!state&&autoSniffEnabled){const tab=await chrome.tabs.get(details.tabId);if(!webpageUrl(tab.url))return;state={auto:true,active:true,expires:Date.now()+600000,page:tab.url,title:tab.title||'媒体',resources:[]};}
    if(!state || !state.active || (state.auto&&!autoSniffEnabled))return;
    if(state.auto)state.expires=Date.now()+600000;
    if(Date.now()>state.expires)return;
    if(state.resources.some(r=>r.url===details.url))return;
    if(state.resources.length>=100)return;
    const length=details.responseHeaders?.find(h=>h.name.toLowerCase()==='content-length')?.value;
    state.resources.push({id:crypto.randomUUID(),url:details.url,type,kind,size:Number(length)||0});
    await chrome.storage.session.set({[key]:state});
  }).catch(console.error);
},{urls:['http://*/*','https://*/*']},['responseHeaders']);
chrome.tabs?.onRemoved?.addListener(tabId=>sniffQueue(()=>chrome.storage.session.remove(`sniff:${tabId}`)).catch(console.error));
chrome.tabs?.onUpdated?.addListener((tabId,change)=>{
  if(change.url)sniffQueue(async()=>{
    const key=`sniff:${tabId}`, state=(await chrome.storage.session.get(key))[key];
    if(state){if(state.auto){await chrome.storage.session.remove(key);}else{state.resources=[];state.page=change.url;await chrome.storage.session.set({[key]:state});}}
  }).catch(console.error);
});
async function sniffAction(message) {
  const [tab]=await chrome.tabs.query({active:true,windowId:message.windowId});
  if(!tab || !webpageUrl(tab.url))throw Error('请切换到要捕获媒体的网页。');
  const key=`sniff:${tab.id}`;
  return sniffQueue(async()=>{
    let state=(await chrome.storage.session.get(key))[key];
    if(message.action==='video-sniff-start'){
      if(!await chrome.permissions.contains({origins:['https://*/*','http://*/*']}))throw Error('请先授权媒体嗅探的网页访问权限。');
      state={active:true,expires:Date.now()+600000,page:tab.url,title:tab.title||'媒体',resources:[]};
      await chrome.storage.session.set({[key]:state});
    }
    if(message.action==='video-sniff-stop' && state){state.active=false;await chrome.storage.session.set({[key]:state});}
    if(message.action==='video-sniff-download'){
      const resource=state?.resources.find(r=>r.id===message.resourceId);
      if(!resource)throw Error('媒体已失效，请重新捕获。');
      if(resource.kind==='manifest')return native({action:'video-start',url:resource.url,genericMedia:true,referer:state.page,height:0,title:state.title});
      return native({action:'video-file-start',url:resource.url,mediaType:resource.type,title:state.title,confirmed:true});
    }
    return {ok:true,active:!!state?.active && (!state.auto||autoSniffEnabled) && Date.now()<state.expires,page:tab.url,resources:state?.resources||[]};
  });
}
