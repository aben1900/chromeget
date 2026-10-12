(() => {
 const icons={open:'<path d="M14 3h7v7M21 3l-10 10M10 4H4v16h16v-6"/>',download:'<path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5"/>'};
 const formats={jpeg:'JPEG',jpg:'JPEG',png:'PNG',webp:'WEBP',gif:'GIF'};
 function render(container,images,options){
  let busy=false,disposed=false,openMenu=null,running=0;const waiting=[],items=[],checks=[];
  const make=(tag,cls,text)=>{const el=document.createElement(tag);if(cls)el.className=cls;if(text)el.textContent=text;return el;};
  function closeMenu(){if(!openMenu)return;openMenu.menu.remove();openMenu.button.setAttribute('aria-expanded','false');openMenu=null;}
  function queueMetadata(item){if(item.requested||disposed)return;item.requested=true;waiting.push(item);pump();}
  async function pump(){if(disposed||running>=3||!waiting.length)return;const item=waiting.shift();running++;pump();try{const data=await options.metadata(item.index);if(!disposed){item.info={...item.info,...data};showInfo(item);}}catch{if(!disposed){item.info.bytes=null;showInfo(item);}}finally{running--;pump();}}
  function showInfo(item){
   const info=item.info,w=item.img.naturalWidth||Number(info.width),h=item.img.naturalHeight||Number(info.height);
   item.format.textContent=formats[String(info.format||'').toLowerCase()]||'类型未知';
   item.dimensions.textContent=w>0&&h>0?w+'×'+h:'尺寸未知';
   const bytes=Number(info.bytes);item.bytes.textContent=info.bytes!=null&&Number.isFinite(bytes)&&bytes>0?(bytes>=1048576?(bytes/1048576).toFixed(1)+' MB':Math.max(1,Math.round(bytes/1024))+' KB'):'大小未知';
   item.bytes.title=info.bytes!=null?'原图文件大小':'服务器未提供文件大小';
  }
  function iconButton(name,icon){const b=make('button','gallery-icon');b.type='button';b.title=name;b.setAttribute('aria-label',name);b.innerHTML='<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+icons[icon]+'</svg>';return b;}
  function downloadMenu(item){
   if(busy)return;if(openMenu?.button===item.download){closeMenu();return;}closeMenu();
   const menu=make('div','gallery-download-menu');menu.setAttribute('role','menu');menu.setAttribute('aria-label','下载格式');menu.append(make('div','gallery-menu-title','下载为'));
   for(const [value,title]of [['original','原格式'+(formats[item.info.format]?'（'+formats[item.info.format]+'）':'')],['jpeg','JPEG'],['png','PNG'],['webp','WEBP']]){
    const b=make('button','',title);b.type='button';b.setAttribute('role','menuitem');b.dataset.format=value;
    b.onclick=async()=>{if(busy)return;closeMenu();try{await options.onDownload(item.index,value);}catch(e){if(!disposed)item.status.textContent=e.message||'图片下载未完成';}};menu.append(b);
   }
   item.figure.append(menu);item.download.setAttribute('aria-expanded','true');openMenu={menu,button:item.download};menu.querySelector('button').focus();
  }
  const observer=typeof IntersectionObserver==='function'?new IntersectionObserver(entries=>{for(const e of entries)if(e.isIntersecting){observer.unobserve(e.target);queueMetadata(items.find(x=>x.figure===e.target));}},{root:container,rootMargin:'160px'}):null;
  for(const [index,info]of images.entries()){
   const figure=make('figure','gallery-item'),header=make('div','gallery-card-header'),actions=make('div','gallery-card-actions'),badges=make('div','gallery-badges');
   const check=make('input');check.type='checkbox';check.checked=true;check.id='gallery-image-'+index;check.setAttribute('aria-label','选择第 '+(index+1)+' 张图片');checks.push(check);
   const open=iconButton('新标签页打开图片','open'),download=iconButton('下载为','download');download.setAttribute('aria-haspopup','menu');download.setAttribute('aria-expanded','false');
   const format=make('span','gallery-format'),dimensions=make('span','gallery-dimensions'),bytes=make('span','gallery-bytes');badges.append(format,dimensions,bytes);actions.append(check,open,download);header.append(actions,badges);
   const label=make('label','gallery-image-label');label.htmlFor=check.id;const img=make('img');img.alt='第 '+(index+1)+' 张图片';img.loading='lazy';img.referrerPolicy='no-referrer';img.src=info.url;
   label.append(img);const caption=make('figcaption','','第 '+(index+1)+' 张'),status=make('div','gallery-image-status');status.setAttribute('role','status');figure.append(header,label,caption,status);figure.dataset.selected='true';
   const item={index,info:{...info},figure,img,check,open,download,format,dimensions,bytes,status};items.push(item);
   check.onchange=()=>{figure.dataset.selected=String(check.checked);options.onSelection(index,check.checked);};
   open.onclick=()=>{try{Promise.resolve(options.open(info.url)).catch(()=>{status.textContent='无法打开图片，请重试';});}catch{status.textContent='无法打开图片，请重试';}};
   download.onclick=()=>downloadMenu(item);img.onload=()=>showInfo(item);showInfo(item);
  }
  container.replaceChildren(...items.map(x=>x.figure));for(const item of items)if(observer)observer.observe(item.figure);else queueMetadata(item);
  function outside(e){if(openMenu&&!openMenu.menu.contains(e.target)&&!openMenu.button.contains(e.target))closeMenu();}
  function keyboard(e){if(e.key==='Escape'&&openMenu){const button=openMenu.button;closeMenu();button.focus();e.preventDefault();}}
  document.addEventListener('click',outside);container.addEventListener('keydown',keyboard);
  return {checks,setBusy(value){busy=value;if(busy)closeMenu();for(const item of items){item.check.disabled=busy;item.download.disabled=busy;item.figure.dataset.selected=String(item.check.checked);}},destroy(){disposed=true;waiting.length=0;observer?.disconnect();closeMenu();document.removeEventListener('click',outside);container.removeEventListener('keydown',keyboard);}};
 }
 window.GalleryCards={render};
})();
