const HOVER_SCRIPT={id:'jingcai-video-hover',matches:['http://*/*','https://*/*'],js:['video-hover.js'],allFrames:true,runAt:'document_idle',persistAcrossSessions:true};
async function setHoverDownload(enabled,windowId){
  if(enabled&&!await chrome.permissions.contains({origins:['http://*/*','https://*/*']}))throw Error('请先授权网页访问。');
  const registered=await chrome.scripting.getRegisteredContentScripts({ids:[HOVER_SCRIPT.id]});
  if(enabled&&registered.length)await chrome.scripting.updateContentScripts([HOVER_SCRIPT]);
  if(enabled&&!registered.length)await chrome.scripting.registerContentScripts([HOVER_SCRIPT]);
  if(!enabled&&registered.length)await chrome.scripting.unregisterContentScripts({ids:[HOVER_SCRIPT.id]});
  await chrome.storage.local.set({hoverDownloadEnabled:enabled});
  if(enabled){const [tab]=await chrome.tabs.query({active:true,windowId});if(tab&&webpageUrl(tab.url))await chrome.scripting.executeScript({target:{tabId:tab.id,allFrames:true},files:['video-hover.js']});}
  return {ok:true,enabled};
}
async function restoreHoverDownload(){
  if(!(await chrome.storage.local.get('hoverDownloadEnabled')).hoverDownloadEnabled)return;
  if(!await chrome.permissions.contains({origins:['http://*/*','https://*/*']}))return;
  if(!(await chrome.scripting.getRegisteredContentScripts({ids:[HOVER_SCRIPT.id]})).length)await chrome.scripting.registerContentScripts([HOVER_SCRIPT]);
  else await chrome.scripting.updateContentScripts([HOVER_SCRIPT]);
}
