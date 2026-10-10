let appWindowId;
const tabs={collect:document.getElementById('collectTab'),clips:document.getElementById('clipsTab'),video:document.getElementById('videoTab'),download:document.getElementById('downloadTab')};
function report(error){const node=document.getElementById('appError');node.hidden=false;node.textContent=error.message;}
function selectView(view){
  if(!Object.hasOwn(tabs,view))return;
  for(const [name,tab] of Object.entries(tabs)){tab.setAttribute('aria-selected',String(view===name));tab.tabIndex=view===name?0:-1;document.getElementById(name).hidden=view!==name;}
  if(view!=='clips'){const frame=document.querySelector('#'+view+' iframe');if(!frame.getAttribute('src'))frame.src=view==='collect'?'collect.html':view==='download'?'download.html':'video.html';}
}
for(const [view,button] of Object.entries(tabs)){
  button.addEventListener('click',async()=>{
    selectView(view);
    try{
      if(appWindowId!==undefined){
        await chrome.storage.session.set({[`app-view:${appWindowId}`]:view});
        if(view==='video'){const url=await currentBiliVideo(appWindowId);if(url)await chrome.storage.session.set({[`video-url:${appWindowId}`]:url});}
      }
    }catch(error){report(error);}
  });
  button.addEventListener('keydown',event=>{if(['ArrowLeft','ArrowRight','Home','End'].includes(event.key)){event.preventDefault();const names=Object.keys(tabs),i=names.indexOf(view);const next=event.key==='Home'?names[0]:event.key==='End'?names.at(-1):names[(i+(event.key==='ArrowRight'?1:-1)+names.length)%names.length];tabs[next].focus();tabs[next].click();}});
}
chrome.windows.getCurrent().then(async current=>{
  appWindowId=current.id;
  // Link results live in the current file-page iframe; reopening starts a fresh list.
  await chrome.storage.session.set({[`download-list-origin:${current.id}`]:null,[`download-return-list:${current.id}`]:null});
  const key=`app-view:${current.id}`;let received=false;
  chrome.storage.onChanged.addListener((changes,area)=>{if(area==='session'&&changes[key]){received=true;selectView(changes[key].newValue);}});
  const data=await chrome.storage.session.get(key);if(!received)selectView(data[key]||'collect');
}).catch(report);
