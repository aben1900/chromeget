(() => {
 let opening=false;
 for(const button of document.querySelectorAll('[data-model-settings]'))button.addEventListener('click',async()=>{if(opening)return;opening=true;button.disabled=true;try{const url=chrome.runtime.getURL('model-settings.html'),windows=await chrome.windows.getAll({populate:true});const parent=await chrome.windows.getCurrent();const width=Math.min(960,parent.width),height=Math.min(800,parent.height);const bounds={width,height,left:Math.round(parent.left+(parent.width-width)/2),top:Math.round(parent.top+(parent.height-height)/2)};const existing=windows.find(w=>w.type==='popup'&&w.tabs?.some(t=>t.url===url));if(existing){if(existing.state&&existing.state!=='normal')await chrome.windows.update(existing.id,{state:'normal'});await chrome.windows.update(existing.id,{...bounds,focused:true});}else await chrome.windows.create({url,type:'popup',...bounds});}catch(e){let status=document.getElementById('modelNavigationStatus');if(!status){status=document.createElement('p');status.id='modelNavigationStatus';status.setAttribute('role','alert');button.parentElement.after(status);}status.textContent='无法打开模型设置：'+e.message;}finally{opening=false;button.disabled=false;}});
})();

(() => {
 let opening=false;
 for(const button of document.querySelectorAll('[data-translation]'))button.addEventListener('click',async()=>{
  if(opening)return;opening=true;button.disabled=true;
  try{
   const url=chrome.runtime.getURL('translate.html'),windows=await chrome.windows.getAll({populate:true}),parent=await chrome.windows.getCurrent();
   const width=Math.min(1100,parent.width),height=Math.min(760,parent.height);
   const bounds={width,height,left:Math.round(parent.left+(parent.width-width)/2),top:Math.round(parent.top+(parent.height-height)/2)};
   const existing=windows.find(w=>w.type==='popup'&&w.tabs?.some(t=>t.url===url));
   if(existing){if(existing.state&&existing.state!=='normal')await chrome.windows.update(existing.id,{state:'normal'});await chrome.windows.update(existing.id,{...bounds,focused:true});}
   else await chrome.windows.create({url,type:'popup',...bounds});
  }catch(e){let status=document.getElementById('translationNavigationStatus');if(!status){status=document.createElement('p');status.id='translationNavigationStatus';status.setAttribute('role','alert');button.parentElement.after(status);}status.textContent='无法打开翻译窗口：'+e.message;}
  finally{opening=false;button.disabled=false;}
 });
})();
