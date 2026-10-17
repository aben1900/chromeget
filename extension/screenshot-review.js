(() => {
 const params=new URLSearchParams(location.search),token=params.get('token'),channel=token?new BroadcastChannel('chromeget-screenshot-review:'+token):null;
 const el=id=>document.getElementById(id),home=el('homeScreenshotFields'),status=el('screenshotStatus'),confirm=el('confirmScreenshot');let options={mode:'home',directory:''},snapshot=null,embedded=params.get('embedded')==='1';
 function send(message){channel?.postMessage(message)}
 function close(action){send({type:action});if(!embedded)window.close()}
 function setDirectory(value){el('screenshotDirectory').value=value||'';el('confirmScreenshot').disabled=!value}
 el('retakeScreenshot').addEventListener('click',()=>close('retake'));el('closeScreenshot').addEventListener('click',()=>close('close'));el('cancelScreenshot').addEventListener('click',()=>close('close'));
 confirm.addEventListener('click',()=>{if(options.mode==='gallery')close('confirm');else{if(!el('screenshotDirectory').value){status.textContent='请选择截图保存目录。';return}confirm.disabled=true;el('chooseScreenshotDirectory').disabled=true;status.textContent='正在保存截图…';send({type:'save',name:el('screenshotName').value,directory:el('screenshotDirectory').value})}});
 el('chooseScreenshotDirectory').addEventListener('click',()=>{el('chooseScreenshotDirectory').disabled=true;status.textContent='请选择保存目录…';send({type:'choose-directory',directory:el('screenshotDirectory').value})});
 channel?.addEventListener('message',event=>{const data=event.data||{};if(data.type==='init'){
  snapshot=data.snapshot;options=data.options||options;document.title=options.mode==='gallery'?'图集截图确认 · 精彩摘录':'截图确认 · 精彩摘录';el('screenshotSourceTitle').textContent=options.sourceTitle||'截图预览';el('screenshotDimensions').textContent=snapshot.width&&snapshot.height?`${snapshot.width} × ${snapshot.height} px`:'PNG 截图';el('ocrImage').src=snapshot.png;home.hidden=options.mode==='gallery';el('galleryScreenshotHint').hidden=options.mode!=='gallery';confirm.textContent=options.mode==='gallery'?(options.confirmLabel||'入待下载区'):'保存图片';el('cancelScreenshot').textContent='取消';el('screenshotName').value=options.name||`截图-${new Date().toISOString().replace(/[:.]/g,'-').slice(0,19)}`;setDirectory(options.directory);if(options.mode==='gallery')confirm.disabled=false;status.textContent=options.mode==='gallery'?'确认后截图将进入当前图集待下载区。':'';return;
  }
  if(data.type==='directory-result'){el('chooseScreenshotDirectory').disabled=false;if(data.error){status.textContent=data.error;return}if(!data.cancelled&&data.directory)setDirectory(data.directory);status.textContent=data.cancelled?'已取消选择目录。':'';return}
  if(data.type==='save-result'){el('chooseScreenshotDirectory').disabled=false;if(!data.ok){confirm.disabled=false;status.textContent=data.error||'保存失败，请重试。';return}status.textContent='已保存：'+data.path;send({type:'save-complete',path:data.path});return}
 });
 document.addEventListener('keydown',event=>{if(event.key==='Escape'){event.preventDefault();close('close')}});
 window.addEventListener('pagehide',()=>send({type:'closed'}),{once:true});send({type:'ready'});
})();
