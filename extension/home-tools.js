(() => {
 const el=id=>document.getElementById(id),menu=el('homeMenu');let imageBusy=false,connectionOpening=false;
 function status(text){el('homeCaptureStatus').textContent=text}
 async function send(action,extra={}){let timer;try{const r=await Promise.race([chrome.runtime.sendMessage({action,...extra}),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('操作超时，请重试。')),action==='capture-directory'?300000:30000)})]);if(!r?.ok)throw Error(r?.error||'操作失败');return r;}finally{clearTimeout(timer)}}
 document.addEventListener('connection-state',event=>{const {state,title}=event.detail,button=el('connectionToggle');button.dataset.state=state;button.title=button.ariaLabel=title+' · 判定可用';button.querySelector('path').setAttribute('d',state==='ready'?'M5 12l4 4L19 6':state==='unavailable'?'M6 6l12 12M18 6L6 18':state==='attention'?'M12 5v9M12 18h.01':'M12 6v6l4 2');});
 async function showConnection(options={}){if(connectionOpening||el('connectionDialog').open)return;connectionOpening=true;const button=el('connectionToggle');button.disabled=true;try{const opened=await window.ConnectionReview?.open?.(options);if(!opened&&!el('connectionDialog').open)el('connectionDialog').showModal()}catch{if(!el('connectionDialog').open)el('connectionDialog').showModal()}finally{connectionOpening=false;button.disabled=false}}
 el('connectionToggle').onclick=()=>showConnection();
 chrome.storage.onChanged.addListener((changes,area)=>{if(area==='session'&&changes['show-setup'])showConnection({guide:true})});
 function placeMenu(){const rect=el('homeMenuToggle').getBoundingClientRect(),width=menu.getBoundingClientRect().width,left=Math.max(12,Math.min(rect.right-width,innerWidth-width-12));menu.style.right='auto';menu.style.left=left+'px';menu.style.top=(rect.bottom+7)+'px';menu.style.setProperty('--menu-pointer',Math.max(10,Math.min(width-10,rect.x+rect.width/2-left))+'px')}
 el('homeMenuToggle').onclick=()=>{menu.hidden=!menu.hidden;el('homeMenuToggle').setAttribute('aria-expanded',String(!menu.hidden));if(!menu.hidden)placeMenu()};
 window.addEventListener('resize',()=>{if(!menu.hidden)placeMenu()});
 function closeMenu(){menu.hidden=true;el('homeMenuToggle').setAttribute('aria-expanded','false')}
 window.addEventListener('blur',closeMenu);
 document.addEventListener('click',e=>{if(!menu.contains(e.target)&&!el('homeMenuToggle').contains(e.target))closeMenu();else if(menu.contains(e.target)&&e.target.closest('button,a'))closeMenu()});
 document.addEventListener('keydown',e=>{if(e.key==='Escape')closeMenu()});
 document.querySelectorAll('[data-close-dialog]').forEach(button=>button.onclick=()=>el(button.dataset.closeDialog).close());
 document.addEventListener('content-saved',()=>{document.querySelector('#clips iframe')?.contentDocument?.getElementById('reload')?.click()});
 el('homeImageCapture').onclick=async()=>{if(imageBusy)return;imageBusy=true;el('homeImageCapture').disabled=true;status('请框选网页区域，确认截图后编辑名称和保存目录。');try{
  let result=await GalleryCapture.capture(chrome.windows.getCurrent().then(w=>w.id),{confirmLabel:'确认截图'});if(result.cancelled){status('已取消截图');return;}
  let directory='';try{directory=(await send('video-status')).directory||''}catch{}
  while(result&&!result.cancelled){const review=await ScreenshotConfirm.open(result,{mode:'home',directory,name:'截图-'+new Date().toISOString().replace(/[:.]/g,'-').slice(0,19),onChooseDirectory:current=>send('capture-directory',{directory:current}),onSave:data=>send('capture-save',{png:result.png,name:data.name,directory:data.directory})});
   if(review.action==='saved'){status('截图已保存到：'+review.path);return;}
   if(review.action!=='retake'){status('已取消截图保存。');return;}
   result=await GalleryCapture.capture(chrome.windows.getCurrent().then(w=>w.id),{confirmLabel:'确认截图',previousRegion:result.region});
  }
  status('已取消截图');
 }catch(e){status('截图失败：'+e.message)}finally{imageBusy=false;el('homeImageCapture').disabled=false}};
})();
