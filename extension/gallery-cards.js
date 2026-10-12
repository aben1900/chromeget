(() => {
 const icons={open:'<path d="M14 3h7v7M21 3l-10 10M10 4H4v16h16v-6"/>',download:'<path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5"/>',remove:'<path d="M5 5l14 14M19 5 5 19"/>'};
 const formats={jpeg:'JPG',gif:'GIF',png:'PNG',bmp:'BMP',svg:'SVG',webp:'WEBP',ico:'ICO',tiff:'TIFF',avif:'AVIF'};
 function normalize(value){const name=String(value||'').toLowerCase();return ({jpg:'jpeg',tif:'tiff'})[name]||(formats[name]?name:'');}
 function imageType(info){
  if(normalize(info.format))return normalize(info.format);
  if(String(info.url).startsWith('data:image/svg+xml;base64,'))return 'svg';
  try{return normalize(new URL(info.url).pathname.match(/\.([a-z]+)$/i)?.[1]);}catch{return '';}
 }
 function render(container,images,options){
  let busy=false,disposed=false,openMenu=null,running=0,filterOpen=false,initialized=false,defaultFilter=true;const filters=new Set(),waiting=[],items=[],checks=[],blobUrls=[];
  let filterButton,filterMenu,filterProgress;const filterChoices=[];
  const make=(tag,cls,text)=>{const el=document.createElement(tag);if(cls)el.className=cls;if(text)el.textContent=text;return el;};
  function closeMenu(){if(!openMenu)return;openMenu.menu.remove();openMenu.button.setAttribute('aria-expanded','false');openMenu=null;}
  function queueMetadata(item){if(item.removed||item.requested||disposed)return;item.requested=true;waiting.push(item);pump();}
  async function pump(){if(disposed||running>=3||!waiting.length)return;const item=waiting.shift();running++;pump();try{const data=await options.metadata(item.index);if(!disposed){item.info={...item.info,...data,format:normalize(data.format)||item.info.format};showInfo(item);}}catch{if(!disposed){item.info.bytes=null;showInfo(item);}}finally{item.resolved=true;running--;if(!disposed)refreshFilter();pump();}}
  const remainingItems=()=>items.filter(item=>!item.removed);
  const matchesFilter=item=>defaultFilter?imageType(item.info)!=='svg':!filters.size||filters.has(imageType(item.info));
  const visibleIndexes=()=>remainingItems().filter(matchesFilter).map(item=>item.index);
  function closeFilter(focus=false){filterOpen=false;if(filterMenu)filterMenu.hidden=true;if(filterButton){filterButton.setAttribute('aria-expanded','false');if(focus)filterButton.focus();}}
  function refreshFilter(notify=true){
   if(!initialized)return;
   const remaining=remainingItems(),counts={any:remaining.length};for(const item of remaining){const type=imageType(item.info);if(type)counts[type]=(counts[type]||0)+1;item.figure.hidden=!matchesFilter(item);}counts.default=remaining.length-(counts.svg||0);
   for(const choice of filterChoices){const count=counts[choice.value]||0,selected=choice.value==='default'?defaultFilter:!defaultFilter&&(choice.value==='any'?!filters.size:filters.has(choice.value));choice.button.textContent=(selected?'✓ ':'　 ')+choice.label+' ('+count+')';choice.button.setAttribute('aria-label',choice.label+' ('+count+')');choice.button.disabled=busy||(!count&&!selected);choice.button.setAttribute('aria-checked',String(selected));}
   if(filterProgress){const resolved=remaining.filter(item=>item.resolved).length;filterProgress.textContent=resolved<remaining.length?'确认类型 '+resolved+'/'+remaining.length:'';filterProgress.hidden=resolved===remaining.length;}
   if(filterButton){const labels=Object.keys(formats).filter(type=>filters.has(type)).map(type=>formats[type]);filterButton.textContent='Type · '+(defaultFilter?'默认（不含 SVG）':labels.length?labels.slice(0,2).join('、')+(labels.length>2?' 等 '+labels.length+' 种':''):'Any')+' ('+visibleIndexes().length+') ⌄';filterButton.title='多选图片类型：'+(defaultFilter?'默认不显示 SVG，可选择 SVG 或 Any 查看':labels.join('、')||'Any（全部）')+'；类型未知的图片保留在默认和 Any 中';}
   empty.hidden=visibleIndexes().length>0;empty.textContent=remaining.length?'所选类型暂无图片，请选择其他类型。':'图集中已无图片，可重新获取或添加截图。';
   if(notify)options.onFilterChange?.();
  }
  function setFilter(value){if(!['any','default'].includes(value)&&!formats[value])return;defaultFilter=value==='default';filters.clear();if(formats[value])filters.add(value);closeMenu();closeFilter();refreshFilter();}
  function toggleFilter(value){if(busy)return;defaultFilter=value==='default';if(value==='any'||defaultFilter)filters.clear();else if(filters.has(value))filters.delete(value);else filters.add(value);closeMenu();refreshFilter();}
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
   const open=iconButton('新标签页打开图片','open'),download=iconButton('下载为','download'),remove=iconButton('从图集中移除','remove');remove.title='从本次图集中移除，不删除已下载文件';download.setAttribute('aria-haspopup','menu');download.setAttribute('aria-expanded','false');
   const format=make('span','gallery-format'),dimensions=make('span','gallery-dimensions'),bytes=make('span','gallery-bytes');badges.append(format,dimensions,bytes);actions.append(check,open,download,remove);header.append(actions,badges);
   const label=make('label','gallery-image-label');label.htmlFor=check.id;const img=make('img');img.alt='第 '+(index+1)+' 张图片';img.loading='lazy';img.referrerPolicy='no-referrer';img.src=info.url;
   const fallback=make('span','gallery-preview-fallback','预览不可用，可下载原图');fallback.hidden=true;
   label.append(img,fallback);const caption=make('figcaption','','第 '+(index+1)+' 张'),status=make('div','gallery-image-status');status.setAttribute('role','status');figure.append(header,label,caption,status);figure.dataset.selected='true';
   const item={index,info:{...info},removed:!!info.excluded,figure,img,check,open,download,remove,format,dimensions,bytes,status};items.push(item);
   remove.onclick=()=>{if(busy||item.removed)return;closeMenu();item.removed=true;check.checked=false;observer?.unobserve(figure);const pending=waiting.indexOf(item);if(pending>=0)waiting.splice(pending,1);figure.remove();options.onRemove?.(index);refreshFilter();};
   check.onchange=()=>{figure.dataset.selected=String(check.checked);options.onSelection(index,check.checked);};
   open.onclick=()=>{try{let url=info.url;if(/^data:image\/(svg\+xml|png);base64,/.test(url)){if(!item.openUrl){const bytes=Uint8Array.from(atob(url.split(',')[1]),c=>c.charCodeAt(0));item.openUrl=URL.createObjectURL(new Blob([bytes],{type:url.slice(5,url.indexOf(';'))}));blobUrls.push(item.openUrl);}url=item.openUrl;}Promise.resolve(options.open(url)).catch(()=>{status.textContent='无法打开图片，请重试';});}catch{status.textContent='无法打开图片，请重试';}};
   download.onclick=()=>downloadMenu(item);img.onload=()=>{img.hidden=false;fallback.hidden=true;showInfo(item);};img.onerror=()=>{img.hidden=true;fallback.hidden=false;fallback.textContent=imageType(item.info)==='tiff'?'浏览器无法预览 TIFF，可下载原图':'预览不可用，可下载原图';};showInfo(item);
  }
  const empty=make('p','gallery-filter-empty','此类型暂无图片，请选择其他类型。');empty.hidden=true;container.replaceChildren(...remainingItems().map(x=>x.figure),empty);
  if(options.filterContainer){
   options.filterContainer.classList.add('gallery-type-filter');filterButton=make('button','gallery-type-toggle');filterButton.type='button';filterButton.setAttribute('aria-label','Type 图片类型过滤');filterButton.setAttribute('aria-haspopup','menu');filterButton.setAttribute('aria-expanded','false');filterMenu=make('div','gallery-type-menu');filterMenu.setAttribute('role','menu');filterMenu.setAttribute('aria-label','图片类型');filterMenu.hidden=true;
   for(const [value,label]of [['default','默认（不含 SVG）'],['any','Any'],...Object.entries(formats)]){const button=make('button');button.type='button';button.setAttribute('role','menuitemcheckbox');button.onclick=()=>toggleFilter(value);filterMenu.append(button);filterChoices.push({value,label,button});}
   filterButton.onclick=()=>{if(busy)return;closeMenu();filterOpen=!filterOpen;filterMenu.hidden=!filterOpen;filterButton.setAttribute('aria-expanded',String(filterOpen));if(filterOpen)filterChoices.find(c=>c.button.getAttribute('aria-checked')==='true'&&!c.button.disabled)?.button.focus();};filterProgress=make('span','gallery-type-progress');filterProgress.setAttribute('role','status');options.filterContainer.replaceChildren(filterButton,filterProgress,filterMenu);
  }
  initialized=true;refreshFilter(false);
  for(const item of remainingItems()){if(observer)observer.observe(item.figure);else queueMetadata(item);if(options.filterContainer||!imageType(item.info))queueMetadata(item);}
  function outside(e){if(openMenu&&!openMenu.menu.contains(e.target)&&!openMenu.button.contains(e.target))closeMenu();if(filterOpen&&!options.filterContainer.contains(e.target))closeFilter();}
  function keyboard(e){if(e.key==='Escape'){if(openMenu){const button=openMenu.button;closeMenu();button.focus();e.preventDefault();}else if(filterOpen){closeFilter(true);e.preventDefault();}}else if(filterOpen&&['ArrowDown','ArrowUp','Home','End'].includes(e.key)){const buttons=filterChoices.map(c=>c.button).filter(b=>!b.disabled),i=buttons.indexOf(document.activeElement);const next=e.key==='Home'?0:e.key==='End'?buttons.length-1:(i+(e.key==='ArrowDown'?1:-1)+buttons.length)%buttons.length;buttons[next]?.focus();e.preventDefault();}}
  document.addEventListener('click',outside);document.addEventListener('keydown',keyboard);
  return {checks,getCount:()=>remainingItems().length,getVisibleIndexes:visibleIndexes,setFilter,setBusy(value){busy=value;if(busy){closeMenu();closeFilter();}if(filterButton)filterButton.disabled=busy;for(const item of items){item.check.disabled=busy;item.download.disabled=busy;item.remove.disabled=busy;item.figure.dataset.selected=String(item.check.checked);}refreshFilter(false);},destroy(){disposed=true;waiting.length=0;observer?.disconnect();closeMenu();closeFilter();for(const url of blobUrls)URL.revokeObjectURL(url);document.removeEventListener('click',outside);document.removeEventListener('keydown',keyboard);}};
 }
 window.GalleryCards={render};
})();
