(() => {
 let generation=0,queue=Promise.resolve();const urls=new Set();
 const viewer=document.createElement('dialog');viewer.className='image-viewer';
 const close=document.createElement('button');close.innerHTML=WindowControls.closeIcon;close.title='关闭图片';close.setAttribute('aria-label','关闭图片');close.className='detail-icon image-close';close.addEventListener('click',()=>viewer.close());
 const image=document.createElement('img');image.alt='完整图片';image.title='点击切换原始尺寸';image.addEventListener('click',()=>image.classList.toggle('original-size'));const toolbar=document.createElement('div');toolbar.className='image-window-controls';toolbar.append(close);WindowControls.maximize(viewer,toolbar);viewer.append(toolbar,image);document.body.append(viewer);
 viewer.addEventListener('close',()=>{image.removeAttribute('src');image.classList.remove('original-size');});
 const observer=new IntersectionObserver(entries=>{for(const e of entries)if(e.isIntersecting){observer.unobserve(e.target);const run=e.target.loadImage;queue=queue.then(run,run);}},{root:document.getElementById('detail'),rootMargin:'100px'});
 async function read(id,name,epoch){let offset=0,revision,mime,total;const chunks=[];do{
  if(epoch!==generation)return null;
  const r=await chrome.runtime.sendMessage({action:'library-image',id,name,offset,revision});
  if(!r?.ok)throw Error(r?.error||'图片预览需要更新本地程序');
  if(!Number.isSafeInteger(r.total)||r.total>32*1024*1024||r.nextOffset<=offset||r.nextOffset>r.total||total!==undefined&&total!==r.total||revision&&revision!==r.revision||!['image/jpeg','image/png','image/gif','image/webp'].includes(r.mime))throw Error('图片数据无效');
  total=r.total;offset=r.nextOffset;revision=r.revision;mime=r.mime;chunks.push(Uint8Array.from(atob(r.data),c=>c.charCodeAt(0)));
 }while(offset<total);if(epoch!==generation)return null;const url=URL.createObjectURL(new Blob(chunks,{type:mime}));urls.add(url);return url;}
 window.LibraryImages={reset(){generation++;observer.disconnect();viewer.close();for(const url of urls)URL.revokeObjectURL(url);urls.clear();},attach(li,id,name){
  const epoch=generation,button=document.createElement('button');button.className='image-thumb';button.type='button';button.disabled=true;button.textContent='正在读取图片…';button.setAttribute('aria-label','查看完整图片：'+name);li.append(button);
  button.loadImage=async()=>{if(epoch!==generation)return;try{const url=await read(id,name,epoch);if(!url||!button.isConnected)return;const img=document.createElement('img');img.alt=name;img.src=url;img.onerror=()=>{button.textContent='图片损坏或无法显示';button.disabled=true;};button.replaceChildren(img);button.disabled=false;button.addEventListener('click',()=>{image.src=url;image.alt=name;viewer.showModal();});}catch(e){if(epoch===generation)button.textContent=e.message;}};observer.observe(button);
 }};
})();
