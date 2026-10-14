(() => {
 // These two functions are injected into the top frame. Keep them self-contained.
 function viewport() {
  return {width:innerWidth,height:innerHeight,x:scrollX,y:scrollY,url:location.href,scale:visualViewport?.scale||1};
 }
 async function clearReviewers(token){for(const host of document.querySelectorAll('[data-chromeget-ocr-review]')){if(host.dataset.chromegetOcrReview===token)continue;host.dispatchEvent(new Event('chromeget-ocr-dispose'));host.remove()}await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))}
 function selectRegion(png,expected,options={}) {
  return new Promise(resolve=>{
   if(Math.abs((visualViewport?.scale||1)-1)>.001){resolve({error:'请先恢复触控板双指缩放，再重新截图。'});return;}
   if(innerWidth!==expected.width||innerHeight!==expected.height){resolve({cancelled:true});return;}
   const host=document.createElement('div');host.setAttribute('data-chromeget-capture','');
   const shadow=host.attachShadow({mode:'closed'}),style=new CSSStyleSheet();
   style.replaceSync(`dialog{position:fixed;inset:0;width:100vw;height:100vh;max-width:none;max-height:none;box-sizing:border-box;margin:0;padding:0;border:0;background:transparent;overflow:hidden;cursor:crosshair;touch-action:none;user-select:none;color:#fff;font:14px/1.4 system-ui,sans-serif}dialog::backdrop{background:transparent}img{position:absolute;inset:0;width:100%;height:100%;pointer-events:none}.shade{position:absolute;inset:0;background:#0003;pointer-events:none}.selection{position:absolute;box-shadow:0 0 0 100vmax #0003;outline:1px solid #fff;pointer-events:none}.tools{position:absolute;display:flex;align-items:center;gap:8px;box-sizing:border-box;padding:7px;border:1px solid #ddd;border-radius:9px;background:#fff;color:#222;box-shadow:0 3px 16px #0004;cursor:default;max-width:calc(100vw - 16px)}button{font:13px/1.4 system-ui;padding:7px 10px;border:1px solid #ddd;border-radius:6px;background:#fff;color:#222;cursor:pointer;white-space:nowrap}button:disabled{color:#aaa;cursor:default}.confirm{background:#222;color:#fff;border-color:#222}.confirm:disabled{background:#eee;border-color:#ddd}.hint{position:absolute;top:14px;left:50%;transform:translateX(-50%);padding:8px 12px;border-radius:7px;background:#222;color:#fff;pointer-events:none;text-align:center;max-width:90%;white-space:nowrap}[hidden]{display:none!important}`);shadow.adoptedStyleSheets=[style];
   const dialog=document.createElement('dialog');dialog.setAttribute('aria-label','框选截图区域');
   const image=document.createElement('canvas');image.setAttribute('aria-hidden','true');Object.assign(image.style,{position:'absolute',inset:'0',width:'100%',height:'100%',pointerEvents:'none'});
   const shade=document.createElement('div');shade.className='shade';const selection=document.createElement('div');selection.className='selection';selection.hidden=true;
   const previous=options.previousRegion,oldRect=previous?.rect,oldView=previous?.viewport;
   if(oldRect&&oldView&&oldView.width===expected.width&&oldView.height===expected.height&&oldView.x===expected.x&&oldView.y===expected.y&&oldView.url===expected.url){const outline=document.createElement('div');outline.style.zIndex='1';outline.className='previous-region';Object.assign(outline.style,{position:'absolute',left:oldRect.x+'px',top:oldRect.y+'px',width:oldRect.width+'px',height:oldRect.height+'px',border:'2px dashed #4ca6ff',background:'transparent',pointerEvents:'none',boxSizing:'border-box'});const marker=document.createElement('span');marker.textContent='上次范围';Object.assign(marker.style,{position:'absolute',top:'-24px',left:'0',color:'#146ec4',background:'#fff',fontSize:'12px',padding:'2px 5px'});outline.append(marker);dialog.append(outline)}
   const hint=document.createElement('div');hint.className='hint';hint.style.zIndex='2';hint.textContent='拖动选择截图区域 · Esc 取消';
   const tools=document.createElement('div');tools.className='tools';tools.style.zIndex='2';tools.style.right='12px';tools.style.bottom='12px';
   const size=document.createElement('span'),cancel=document.createElement('button'),confirm=document.createElement('button');
   cancel.textContent='取消';confirm.textContent=options.confirmLabel||'确认截图';confirm.className='confirm';confirm.disabled=true;if(options.technology){const technology=document.createElement('span');technology.textContent=options.technology;tools.append(technology)}tools.append(size,cancel,confirm);dialog.append(image,shade,selection,hint,tools);shadow.append(dialog);
   let start=null,rect=null,settled=false;
   const timer=setTimeout(()=>finish({cancelled:true}),120000);
   function finish(result){if(settled)return;settled=true;clearTimeout(timer);window.removeEventListener('resize',abort);window.removeEventListener('pagehide',abort);visualViewport?.removeEventListener('resize',abort);visualViewport?.removeEventListener('scroll',abort);document.removeEventListener('visibilitychange',visibility);document.removeEventListener('chromeget-capture-cancel',externalCancel);host.remove();resolve(result);}
   function abort(){finish({cancelled:true});}
   function visibility(){if(document.hidden)abort();}
   function externalCancel(event){if(event.detail===options.captureId)abort()}
   function point(e){return {x:Math.max(0,Math.min(innerWidth,e.clientX)),y:Math.max(0,Math.min(innerHeight,e.clientY))};}
   function draw(e){const p=point(e);rect={x:Math.min(p.x,start.x),y:Math.min(p.y,start.y),width:Math.abs(p.x-start.x),height:Math.abs(p.y-start.y)};selection.hidden=false;shade.hidden=true;Object.assign(selection.style,{left:rect.x+'px',top:rect.y+'px',width:rect.width+'px',height:rect.height+'px'});confirm.disabled=rect.width<2||rect.height<2;size.textContent=Math.round(rect.width)+' × '+Math.round(rect.height);}
   dialog.onpointerdown=e=>{if(e.button!==0||tools.contains(e.target))return;e.preventDefault();start=point(e);dialog.setPointerCapture(e.pointerId);draw(e);};
   dialog.onpointermove=e=>{if(start)draw(e);};dialog.onpointerup=e=>{if(!start)return;draw(e);start=null;dialog.releasePointerCapture(e.pointerId);if(!confirm.disabled)confirm.focus();};dialog.onpointercancel=()=>{start=null;};
   confirm.onclick=()=>{if(rect&&!confirm.disabled)finish({rect,viewport:{width:expected.width,height:expected.height}});};cancel.onclick=abort;
   dialog.oncancel=e=>{e.preventDefault();abort();};dialog.onkeydown=e=>{if(e.key==='Escape'){e.preventDefault();abort();}else if(e.key==='Enter'&&!confirm.disabled){e.preventDefault();confirm.click();}};
   window.addEventListener('resize',abort);window.addEventListener('pagehide',abort);visualViewport?.addEventListener('resize',abort);visualViewport?.addEventListener('scroll',abort);document.addEventListener('visibilitychange',visibility);document.addEventListener('chromeget-capture-cancel',externalCancel);
   // Decode bytes without a DOM image URL; strict website img-src policies must not hide the frozen snapshot.
   Promise.resolve().then(async()=>{
    const bytes=Uint8Array.from(atob(png.split(',')[1]),c=>c.charCodeAt(0));
    const bitmap=await createImageBitmap(new Blob([bytes],{type:'image/png'}));
    if(settled){bitmap.close();return;}
    image.width=bitmap.width;image.height=bitmap.height;image.getContext('2d').drawImage(bitmap,0,0);bitmap.close();
    if(innerWidth!==expected.width||innerHeight!==expected.height){abort();return;}
    document.documentElement.append(host);dialog.showModal();cancel.focus({preventScroll:true});
   }).catch(()=>finish({error:'无法显示截图画面，请重新截图。'}));
  });
 }
 async function crop(png,selection) {
  const {rect:r,viewport:v}=selection||{};
  if(!r||!v||![r.x,r.y,r.width,r.height,v.width,v.height].every(Number.isFinite)||r.x<0||r.y<0||r.width<2||r.height<2||v.width<=0||v.height<=0||r.x+r.width>v.width||r.y+r.height>v.height)throw Error('截图区域无效，请重新框选。');
  if(typeof png!=='string'||!png.startsWith('data:image/png;base64,')||png.length>64*1024*1024)throw Error('截图数据无效或过大，请缩小浏览器窗口后重试。');
  const image=new Image();image.src=png;await image.decode();
  const sx=image.naturalWidth/v.width,sy=image.naturalHeight/v.height,x=Math.round(r.x*sx),y=Math.round(r.y*sy),width=Math.min(image.naturalWidth-x,Math.round(r.width*sx)),height=Math.min(image.naturalHeight-y,Math.round(r.height*sy));
  if(width<1||height<1||width*height>40000000)throw Error('截图区域过大，请选择更小的范围。');
  const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;canvas.getContext('2d').drawImage(image,x,y,width,height,0,0,width,height);
  const result=canvas.toDataURL('image/png');if((result.length-22)*3/4>8*1024*1024)throw Error('截图超过 8 MB，请选择更小的范围。');
  return {png:result,width,height};
 }
 async function capture(windowId,options={},beforeCapture=null) {
  const captureId=globalThis.crypto?.randomUUID?.()||Date.now()+'-'+Math.random().toString(36).slice(2);options={...options,captureId};let cancelled=false,cancelTarget=null;
  function cancel(event){if(event.key!=='Escape')return;event.preventDefault();event.stopImmediatePropagation();cancelled=true;if(cancelTarget)chrome.scripting.executeScript({target:cancelTarget,func:id=>document.dispatchEvent(new CustomEvent('chromeget-capture-cancel',{detail:id})),args:[captureId]}).catch(()=>{})}
  window.addEventListener('keydown',cancel,true);
  try {
  // Request in the button's click gesture, before any window/tab lookup awaits.
  const grant=chrome.permissions.request({origins:['<all_urls>']});
  if(!await grant)return {cancelled:true,reason:'未允许截图权限'};
  if(cancelled)return {cancelled:true};
  windowId=await windowId;
  const [tab]=await chrome.tabs.query({active:true,windowId});
  if(!tab?.id||!/^https?:\/\//i.test(tab.url)||tab.pendingUrl)throw Error('请先打开要截图的普通网页，等待加载完成后重试。');
  await chrome.scripting.executeScript({target:{tabId:tab.id,frameIds:[0]},func:clearReviewers,args:[options.reviewerToken||'']});
  if(beforeCapture)await beforeCapture();
  if(cancelled)return {cancelled:true};
  const changed='截图时网页发生变化，已取消。请回到目标网页后重新截图。';
  async function sameTab(){const current=await chrome.tabs.get(tab.id);if(!current.active||current.windowId!==windowId||current.url!==tab.url||current.pendingUrl)throw Error(changed);}
  let before,png;
  try{
   [before]=await chrome.scripting.executeScript({target:{tabId:tab.id,frameIds:[0]},func:viewport});
   if(Math.abs((before.result.scale||1)-1)>.001)throw Error('请先恢复触控板双指缩放，再重新截图。');
   await sameTab();png=await chrome.tabs.captureVisibleTab(windowId,{format:'png'});
  }catch(error){if(/permission|activeTab|all_urls|cannot access|cannot be scripted/i.test(error.message))throw Error('Chrome 未允许当前网页的截图权限。请再次点击区域截图授权；若仍失败，请在扩展详情中检查网站访问权限。');throw error;}
  await sameTab();
  const target={tabId:tab.id,documentIds:[before.documentId]};
  cancelTarget=target;
  const [after]=await chrome.scripting.executeScript({target,func:viewport});
  if(JSON.stringify(before.result)!==JSON.stringify(after?.result))throw Error(changed);
  if(cancelled)return {cancelled:true};
  const [picked]=await chrome.scripting.executeScript({target,func:selectRegion,args:[png,before.result,options]});
  if(picked?.result?.error)throw Error(picked.result.error);
  if(!picked?.result||picked.result.cancelled)return {cancelled:true};
  await sameTab();
  const [current]=await chrome.scripting.executeScript({target,func:viewport});
  if(current?.result.url!==before.result.url)throw Error(changed);
  const cropped=await crop(png,picked.result);if(cancelled)return {cancelled:true};
  return {...cropped,sourceUrl:tab.url,sourceTitle:tab.title||'',region:{rect:picked.result.rect,viewport:before.result}};
  } catch(error){if(cancelled)return {cancelled:true};throw error;
  } finally {window.removeEventListener('keydown',cancel,true)}
 }
 window.GalleryCapture={capture,selectRegion,crop};
})();
