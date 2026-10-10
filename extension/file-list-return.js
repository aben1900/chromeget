(() => {
 const button=document.getElementById('backToFileList'),input=document.getElementById('url');
 let windowId,origin=null;
 const render=()=>{button.hidden=!origin?.url||origin.url!==input.value.trim();};
 input.addEventListener('input',render);
 chrome.windows.getCurrent().then(async w=>{
  windowId=w.id;const key=`download-list-origin:${w.id}`,urlKey=`video-url:${w.id}`;let changed=false;
  chrome.storage.onChanged.addListener((changes,area)=>{
   if(area!=='session')return;
   if(changes[key]){changed=true;origin=changes[key].newValue;}
   if(changes[key]||changes[urlKey])render();
  });
  const saved=await chrome.storage.session.get([key,urlKey]);
  if(!changed)origin=saved[key];
  if(saved[urlKey]&&!input.value)input.value=saved[urlKey];
  render();
 }).catch(()=>{button.hidden=true;});
 button.addEventListener('click',async()=>{
  if(!Number.isInteger(windowId))return;
  button.disabled=true;
  try{await chrome.storage.session.set({[`download-return-list:${windowId}`]:Date.now(),[`app-view:${windowId}`]:'download',[`download-list-origin:${windowId}`]:null});origin=null;render();}
  catch{const error=document.getElementById('error');if(error)error.textContent='暂时无法返回，请点击顶部“文件下载”标签。';}
  finally{button.disabled=false;}
 });
})();
