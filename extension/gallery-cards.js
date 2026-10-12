(() => {
 const icons={open:'<path d="M14 3h7v7M21 3l-10 10M10 4H4v16h16v-6"/>',download:'<path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5"/>'};
 const formats={jpeg:'JPG',gif:'GIF',png:'PNG',bmp:'BMP',svg:'SVG',webp:'WEBP',ico:'ICO',tiff:'TIFF',avif:'AVIF'};
 function normalize(value){const name=String(value||'').toLowerCase();return ({jpg:'jpeg',tif:'tiff'})[name]||(formats[name]?name:'');}
 function imageType(info){
  if(normalize(info.format))return normalize(info.format);
  if(String(info.url).startsWith('data:image/svg+xml;base64,'))return 'svg';
  try{return normalize(new URL(info.url).pathname.match(/\.([a-z]+)$/i)?.[1]);}catch{return '';}
 }
 function render(container,images,options){
  let busy=false,disposed=false,openMenu=null,running=0,filter='any',filterOpen=false,initialized=false;const waiting=[],items=[],checks=[],blobUrls=[];
  let filterButton,filterMenu,filterProgress;const filterChoices=[];
  const make=(tag,cls,text)=>{const el=document.createElement(tag);if(cls)el.className=cls;if(text)el.textContent=text;return el;};
  function closeMenu(){if(!openMenu)return;openMenu.menu.remove();openMenu.button.setAttribute('aria-expanded','false');openMenu=null;}
  function queueMetadata(item){if(item.requested||disposed)return;item.requested=true;waiting.push(item);pump();}
  async function pump(){if(disposed||running>=3||!waiting.length)return;const item=waiting.shift();running++;pump();try{const data=await options.metadata(item.index);if(!disposed){item.info={...item.info,...data,format:normalize(data.format)||item.info.format};showInfo(item);}}catch{if(!disposed){item.info.bytes=null;showInfo(item);}}finally{item.resolved=true;running--;if(!disposed)refreshFilter();pump();}}
  const visibleIndexes=()=>items.filter(item=>filter==='any'||imageType(item.info)===filter).map(item=>item.index);
  function closeFilter(focus=false){filterOpen=false;if(filterMenu)filterMenu.hidden=true;if(filterButton){filterButton.setAttribute('aria-expanded','false');if(focus)filterButton.focus();}}
  function refreshFilter(notify=true){
   if(!initialized)return;
   const counts={any:items.length};for(const item of items){const type=imageType(item.info);if(type)counts[type]=(counts[type]||0)+1;item.figure.hidden=filter!=='any'&&type!==filter;}
   for(const choice of filterChoices){const count=counts[choice.value]||0;choice.button.textContent=(choice.value===filter?'✓ ':'　 ')+choice.label+' ('+count+')';choice.button.setAttribute('aria-label',choice.label+' ('+count+')');choice.button.disabled=busy||!count;choice.button.setAttribute('aria-checked',String(filter===choice.value));}
   if(filterProgress){const resolved=items.filter(item=>item.resolved).length;filterProgress.textContent=resolved<items.length?'确认类型 '+resolved+'/'+items.length:'';filterProgress.hidden=resolved===items.length;}
   if(filterButton)filterButton.textContent='Type · '+(filter==='any'?'Any':formats[filter])+' ('+(counts[filter]||0)+') ⌄';
   empty.hidden=visibleIndexes().length>0;
   if(notify)options.onFilterChange?.();
  }
  function setFilter(value){if(value!=='any'&&!formats[value])return;filter=value;closeMenu();closeFilter();refreshFilter();}
  function showInfo(item){
   const info=item.info,w=item.img.naturalWidth||Number(info.width),h=item.img.naturalHeight||Number(info.height);
   item.format.textContent=formats[imageType(info)]||'类型未知';
   item.dimensions.textContent=w>0&&h>0?w+'×'+h:'尺寸未知';
   const bytes=Number(info.bytes);item.bytes.textContent=info.bytes!=null&&Number.isFinite(bytes)&&bytes>0?(bytes>=1048576?(bytes/1048576).toFixed(1)+' MB':Math.max(1,Math.round(bytes/1024))+' KB'):'大小未知';
   item.bytes.title=info.bytes!=null?'原图文件大小':'服务器未提供文件大小';
   refreshFilter();
  }
  function iconButton(name,icon){const b=make('button','gallery-icon');b.type='button';b.title=name;b.setAttribute('aria-label',name);b.innerHTML='<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+icons[icon]+'</svg>';return b;}
  function downloadMenu(item){
   if(busy)return;if(openMenu?.button===item.download){closeMenu();return;}closeMenu();closeFilter();
   const menu=make('div','gallery-download-menu');menu.setAttribute('role','menu');menu.setAttribute('aria-label','下载格式');menu.append(make('div','gallery-menu-title','下载为'));
   for(const [value,title]of [['original','原格式'+(formats[imageType(item.info)]?'（'+formats[imageType(item.info)]+'）':'')],['jpeg','JPEG'],['png','PNG'],['webp','WEBP']]){
    const b=make('button','',title);b.type='button';b.setAttribute('role','menuitem');b.dataset.format=value;
    if(value!=='original'&&(imageType(item.info)==='svg'||item.info.canConvert===false)){b.disabled=true;b.title='SVG 保留矢量原图，暂不转换为位图';}
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
   const fallback=make('span','gallery-preview-fallback','预览不可用，可下载原图');fallback.hidden=true;
   label.append(img,fallback);const caption=make('figcaption','','第 '+(index+1)+' 张'),status=make('div','gallery-image-status');status.setAttribute('role','status');figure.append(header,label,caption,status);figure.dataset.selected='true';
   const item={index,info:{...info},figure,img,check,open,download,format,dimensions,bytes,status};items.push(item);
   check.onchange=()=>{figure.dataset.selected=String(check.checked);options.onSelection(index,check.checked);};
   open.onclick=()=>{try{let url=info.url;if(url.startsWith('data:image/svg+xml;base64,')){if(!item.openUrl){const bytes=Uint8Array.from(atob(url.split(',')[1]),c=>c.charCodeAt(0));item.openUrl=URL.createObjectURL(new Blob([bytes],{type:'image/svg+xml'}));blobUrls.push(item.openUrl);}url=item.openUrl;}Promise.resolve(options.open(url)).catch(()=>{status.textContent='无法打开图片，请重试';});}catch{status.textContent='无法打开图片，请重试';}};
   download.onclick=()=>downloadMenu(item);img.onload=()=>{img.hidden=false;fallback.hidden=true;showInfo(item);};img.onerror=()=>{img.hidden=true;fallback.hidden=false;fallback.textContent=imageType(item.info)==='tiff'?'浏览器无法预览 TIFF，可下载原图':'预览不可用，可下载原图';};showInfo(item);
  }
  const empty=make('p','gallery-filter-empty','此类型暂无图片，请选择其他类型。');empty.hidden=true;container.replaceChildren(...items.map(x=>x.figure),empty);
  if(options.filterContainer){
   options.filterContainer.classList.add('gallery-type-filter');filterButton=make('button','gallery-type-toggle');filterButton.type='button';filterButton.setAttribute('aria-label','Type 图片类型过滤');filterButton.setAttribute('aria-haspopup','menu');filterButton.setAttribute('aria-expanded','false');filterMenu=make('div','gallery-type-menu');filterMenu.setAttribute('role','menu');filterMenu.setAttribute('aria-label','图片类型');filterMenu.hidden=true;
   for(const [value,label]of [['any','Any'],...Object.entries(formats)]){const button=make('button');button.type='button';button.setAttribute('role','menuitemradio');button.onclick=()=>{setFilter(value);filterButton.focus();};filterMenu.append(button);filterChoices.push({value,label,button});}
   filterButton.onclick=()=>{if(busy)return;closeMenu();filterOpen=!filterOpen;filterMenu.hidden=!filterOpen;filterButton.setAttribute('aria-expanded',String(filterOpen));if(filterOpen)filterChoices.find(c=>c.value===filter)?.button.focus();};filterButton.title='按类型筛选；类型未知的图片保留在 Any 中';filterProgress=make('span','gallery-type-progress');filterProgress.setAttribute('role','status');options.filterContainer.replaceChildren(filterButton,filterProgress,filterMenu);
  }
  initialized=true;refreshFilter(false);
  for(const item of items){if(observer)observer.observe(item.figure);else queueMetadata(item);if(options.filterContainer||!imageType(item.info))queueMetadata(item);}
  function outside(e){if(openMenu&&!openMenu.menu.contains(e.target)&&!openMenu.button.contains(e.target))closeMenu();if(filterOpen&&!options.filterContainer.contains(e.target))closeFilter();}
  function keyboard(e){if(e.key==='Escape'){if(openMenu){const button=openMenu.button;closeMenu();button.focus();e.preventDefault();}else if(filterOpen){closeFilter(true);e.preventDefault();}}else if(filterOpen&&['ArrowDown','ArrowUp','Home','End'].includes(e.key)){const buttons=filterChoices.map(c=>c.button).filter(b=>!b.disabled),i=buttons.indexOf(document.activeElement);const next=e.key==='Home'?0:e.key==='End'?buttons.length-1:(i+(e.key==='ArrowDown'?1:-1)+buttons.length)%buttons.length;buttons[next]?.focus();e.preventDefault();}}
  document.addEventListener('click',outside);document.addEventListener('keydown',keyboard);
  return {checks,getVisibleIndexes:visibleIndexes,setFilter,setBusy(value){busy=value;if(busy){closeMenu();closeFilter();}if(filterButton)filterButton.disabled=busy;for(const item of items){item.check.disabled=busy;item.download.disabled=busy;item.figure.dataset.selected=String(item.check.checked);}refreshFilter(false);},destroy(){disposed=true;waiting.length=0;observer?.disconnect();closeMenu();closeFilter();for(const url of blobUrls)URL.revokeObjectURL(url);document.removeEventListener('click',outside);document.removeEventListener('keydown',keyboard);}};
 }
 window.GalleryCards={render};
})();
