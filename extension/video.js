const $ = id => document.getElementById(id);
let galleryDraft=null, gallerySelected=new Set(), galleryChecks=[],galleryView=null,pageMediaUrl='';
let parsedUrl='', busy=false, activeOperation='', lastMediaTarget='video', timer, jobId, taskActive=false, runningSelection;
function visibleGalleryIndexes(){return galleryView?.getVisibleIndexes()||galleryChecks.map((_,index)=>index);}
function selectedGalleryIndexes(){return visibleGalleryIndexes().filter(index=>gallerySelected.has(index));}
function mediaStatus(text,details=text){$('status').textContent=text;$('status').title=details;}
$('url').value = new URL(location.href).searchParams.get('url') || '';
function useVideoUrl(url) {
  if (!webpageUrl(url) || url === $('url').value) return;
  $('url').value=url; parsedUrl=''; $('title').textContent=''; $('height').disabled=true; controls();settings().catch(()=>{$('cookieStatus').textContent='登录态读取失败';});
}
chrome.windows.getCurrent().then(async current => {
  const key = `video-url:${current.id}`;
  let received = false,lastHoverRequest='';
  async function receiveHover(request){
    if(!request?.id||request.id===lastHoverRequest||Date.now()-request.time>15000||!webpageUrl(request.url))return;
    lastHoverRequest=request.id;const receiptKey=`hover-receipt:${current.id}`;
    if(busy){await chrome.storage.session.set({[receiptKey]:{id:request.id,ok:false,error:'侧栏正在处理其他操作，请完成后再点悬浮下载。'}});return;}
    useVideoUrl(request.url);mediaStatus('已收到悬浮下载请求，正在获取视频…');
    const parsing=inspectVideo({target:'video',directMedia:true});
    await chrome.storage.session.set({[receiptKey]:{id:request.id,ok:true}});
    await parsing;
  }
  function acceptHover(request){receiveHover(request).catch(error=>{$('error').textContent=error.message;});}
  const hoverKey=`hover-request:${current.id}`;

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'session' && changes[key]) { received = true; useVideoUrl(changes[key].newValue); }
    if(area==='session'&&changes[hoverKey]?.newValue){received=true;acceptHover(changes[hoverKey].newValue);}
  });
  const hover=(await chrome.storage.session.get(hoverKey))[hoverKey];if(hover){const receiptKey=`hover-receipt:${current.id}`,receipt=(await chrome.storage.session.get(receiptKey))[receiptKey];if(receipt?.id!==hover.id){received=true;acceptHover(hover);}}
  const saved = (await chrome.storage.session.get(key))[key];
  if (!received && saved) useVideoUrl(saved);
  if (!$('url').value) {
    const activeUrl = await currentBiliVideo(current.id);
    if (!received && !$('url').value) useVideoUrl(activeUrl);
  }
}).catch(error => { if(typeof Recovery!=='undefined')Recovery.setError($('error'),error);else $('error').textContent=error.message; });
$('extractUrl').addEventListener('click', async () => {
  $('extractUrl').disabled=true;
  try {
    const current=await chrome.windows.getCurrent();
    const url=await currentWebpage(current.id);
    if (!url) throw Error('无法提取当前页面网址，请切换到普通网站页面后重试。');
    useVideoUrl(url); $('error').textContent='';
    mediaStatus('网址已提取');
    await chrome.storage.session.set({[`video-url:${current.id}`]:url});
  } catch(error) { if(typeof Recovery!=='undefined')Recovery.setError($('error'),error);else $('error').textContent=error.message; }
  finally { controls(); }
});
async function send(action, extra={}) {
  let timeout, result;
  if(['video-info','video-start'].includes(action)&&!videoSite(extra.url||$('url').value)){extra.genericMedia=true;const w=await chrome.windows.getCurrent();const k=`video-source:${w.id}`;const src=(await chrome.storage.session.get(k))[k];if(src?.url===(extra.url||$('url').value))extra.referer=src.referer;}
  const wait=['video-folder','video-cookies'].includes(action)?300000:['video-info','video-hf-info'].includes(action)?110000:20000;
  try { result=await Promise.race([chrome.runtime.sendMessage({action,site:videoSite($('url').value) || 'bilibili',url:$('url').value.trim(),...extra}),new Promise((_,reject)=>{timeout=setTimeout(()=>reject(Error('本地程序响应超时。可重试；若刚启动下载，请重新打开界面查看任务状态。')),wait);})]); }
  finally { clearTimeout(timeout); }
  if(!result?.ok)throw (typeof Recovery!=='undefined'?Recovery.toError(result):Error(result?.error || '本地程序未响应，请更新开始使用.cmd。'));
  return result;
}
function controls() {
  const platform=videoSite($('url').value);
  const source=websiteName($('url').value);
  $('website').textContent=source||'';$('website').title=source||'';
  const name=platform==='x'?'X':platform==='youtube'?'YouTube':platform==='toutiao'?'头条':platform==='xiaohongshu'?'小红书':platform==='bilibili'?'B 站':'';
  $('browserCookies').textContent='浏览器登录';$('browserCookies').title=name?'使用本浏览器的'+name+'登录态':'先填写支持的视频网址';
  for(const id of ['inspect','inspectGallery','folder','cookies','clearCookies','browserCookies','extractUrl'])$(id).disabled=busy;
  $('inspect').textContent=activeOperation==='inspect'?'正在获取视频…':'获取视频';
  $('inspect').setAttribute('aria-busy',String(activeOperation==='inspect'));
  $('inspectGallery').textContent=activeOperation==='inspect-gallery'?'正在获取图集…':'获取图集';
  $('inspectGallery').setAttribute('aria-busy',String(activeOperation==='inspect-gallery'));
  for(const id of ['browserCookies','cookies','clearCookies'])$(id).disabled=busy || !platform;
  const galleryActive=galleryDraft && parsedUrl===$('url').value.trim();
  if(!galleryActive&&galleryDraft){galleryDraft=null;galleryView?.destroy();galleryView=null;galleryChecks=[];gallerySelected.clear();}
  $('galleryCard').hidden=false;
  if(!galleryView)galleryView=GalleryCards.render($('galleryGrid'),[],{filterContainer:$('galleryTypeFilter'),onFilterChange:controls});
  $('captureGalleryImage').disabled=busy;
  $('qualityCard').hidden=!!galleryActive;
  $('download').hidden=!!galleryActive;
  const visibleSelection=selectedGalleryIndexes();
  $('confirmGallery').disabled=busy || !galleryActive || !visibleSelection.length;
  $('gallerySelectAll').disabled=busy||!visibleGalleryIndexes().length;$('gallerySelectNone').disabled=busy||!visibleGalleryIndexes().length;
  for(const check of galleryChecks)check.disabled=busy;
  galleryView?.setBusy(busy);
  if(parsedUrl!==$('url').value.trim()||$('mediaMode').value==='audio')$('qualityNotice').hidden=true;else $('qualityNotice').hidden=!$('qualityNotice').textContent;
  $('pageMediaCard').hidden=pageMediaUrl!==$('url').value.trim()||!$('pageVideos').childElementCount;
  for(const button of $('pageVideos').querySelectorAll('button'))button.disabled=busy;
  if(galleryActive){$('galleryCount').textContent='共 '+(galleryView?.getCount()??galleryDraft.images.length)+' 张 · 显示 '+visibleGalleryIndexes().length+' 张 · 已选 '+visibleSelection.length+' 张';$('confirmGallery').textContent='确认下载所选 '+visibleSelection.length+' 张图片';}
  else {$('galleryCount').textContent='暂无图片，可直接截图或获取图集。';$('confirmGallery').textContent='确认下载所选图片';}
  const audio=$('mediaMode').value==='audio';$('audioOptions').hidden=!audio;$('videoQuality').hidden=audio;$('height').disabled=busy||audio||!parsedUrl;$('mediaMode').disabled=busy;$('audioFormat').disabled=busy;
  const duplicate=taskActive && runningSelection?.url===parsedUrl && runningSelection?.height===Number($('height').value)&&(runningSelection?.quality||0)===(Number($('height').selectedOptions[0]?.dataset.quality)||0)&&(runningSelection?.mediaMode||'video')===($('mediaMode').value||'video')&&(runningSelection?.audioFormat||'best')===($('audioFormat').value||'best');
  $('download').disabled=busy || duplicate || !parsedUrl || parsedUrl!==$('url').value.trim();
  $('download').textContent=busy?'正在处理…':duplicate?'该画质正在下载':!parsedUrl || parsedUrl!==$('url').value.trim()?'请先解析媒体':'开始下载';
}
let settingsRevision=0;
async function settings() {
  const revision=++settingsRevision,url=$('url').value;
  const data=await send('video-status');if(revision!==settingsRevision||url!==$('url').value)return;$('directory').textContent=data.directory;
  $('directoryInput').value=data.directory;
  $('galleryDestination').textContent='保存至：'+data.directory+'（自动新建图集文件夹）';
  const site=videoSite($('url').value);$('cookieStatus').textContent=site&&data.cookies?websiteName($('url').value)+'已登录':'未使用 Cookie';$('cookieStatus').dataset.enabled=String(!!site&&!!data.cookies);$('cookieStatus').title=data.cookies?'已启用保存的 Cookie；是否仍有效及会员画质以实际解析结果为准':'';
}
$('url').addEventListener('input',()=>{if(parsedUrl!==$('url').value.trim())$('title').textContent='';controls();$('cookieStatus').textContent='未使用 Cookie';settings().catch(()=>{$('cookieStatus').textContent='登录态读取失败';});});
$('height').addEventListener('change',controls);
$('mediaMode').addEventListener('change',controls);$('audioFormat').addEventListener('change',controls);
$('openRecent').addEventListener('click',async()=>{
  $('openRecent').disabled=true;$('locationStatus').textContent='正在打开…';
  try {
    const result=await send('video-open-recent');
    $('locationStatus').textContent=result.selected?'已打开目录并选中最近下载的视频':'视频文件已移动或删除，已打开原目录';
  } catch(error) { if(typeof Recovery!=='undefined')Recovery.setError($('locationStatus'),error);else $('locationStatus').textContent=error.message; }
  finally { $('openRecent').disabled=false; }
});
function showGallery(data,selection=null){
  galleryView?.destroy();galleryView=null;
  galleryDraft=data;gallerySelected=selection||new Set(data.images.map((_,index)=>index));
  $('galleryDestination').textContent='保存至：'+data.directory+'（原格式保留；转换图片存入对应格式子文件夹）';
  galleryView=GalleryCards.render($('galleryGrid'),data.images,{
    filterContainer:$('galleryTypeFilter'),onFilterChange:controls,
    onSelection(index,checked){if(checked)gallerySelected.add(index);else gallerySelected.delete(index);controls();},
    onRemove(index){data.images[index]={...data.images[index],excluded:true};gallerySelected.delete(index);controls();},
    open:url=>chrome.tabs.create({url}),
    metadata:index=>data.images[index].captured?Promise.resolve(data.images[index]):send('video-gallery-image-info',{draftId:data.draftId,index}),
    onDownload:(index,imageFormat)=>startGallery([index],imageFormat,false)
  });galleryChecks=galleryView.checks;
  galleryChecks.forEach((check,index)=>{check.checked=gallerySelected.has(index);});galleryView.setBusy(busy);
}
$('captureGalleryImage').addEventListener('click',async()=>{
  if(busy)return;
  busy=true;activeOperation='capture';controls();$('error').textContent='';$('captureStatus').textContent='请在网页上拖动框选，再确认截图；Esc 取消。';$('captureStatus').dataset.state='working';
  const snapshot=galleryDraft,originalUrl=$('url').value.trim(),original=parsedUrl===originalUrl?galleryDraft:null,selected=new Set(original?gallerySelected:[]);
  try{
    const result=await GalleryCapture.capture(chrome.windows.getCurrent().then(w=>w.id),{confirmLabel:'入待下载区'});
    if(result.cancelled){$('captureStatus').textContent='已取消截图';$('captureStatus').dataset.state='cancelled';return;}
    if(galleryDraft!==snapshot||$('url').value.trim()!==originalUrl)throw Error('当前图集已变化，请重新截图。');
    const saved=await send('video-gallery-capture',{draftId:original?.draftId,png:result.png,sourceUrl:result.sourceUrl,sourceTitle:result.sourceTitle});
    if(galleryDraft!==snapshot||$('url').value.trim()!==originalUrl)throw Error('当前图集已变化，请重新截图。');
    const image={...saved.image,url:result.png,captured:true};
    if(!original){$('url').value=result.sourceUrl;parsedUrl=result.sourceUrl;}
    showGallery({...original,directory:saved.directory,draftId:saved.draftId,images:[image,...(original?.images||[])]},new Set([0,...[...selected].map(index=>index+1)]));
    $('galleryGrid').scrollTop=0;$('captureStatus').textContent='截图已放到第一张并选中，可预览或选择格式下载。';$('captureStatus').dataset.state='success';
  }catch(error){$('captureStatus').dataset.state='error';$('captureStatus').textContent='截图失败：'+(typeof Recovery!=='undefined'?Recovery.normalize(error).details:error.message);}
  finally{busy=false;activeOperation='';controls();}
});
async function inspectVideo(options={}) {
  if(busy)return;
  const target=options.target==='gallery'?'gallery':'video';lastMediaTarget=target;$('error').dataset.mediaTarget=target;$('title').textContent='';$('title').title='';
  busy=true;activeOperation=target==='gallery'?'inspect-gallery':'inspect';parsedUrl='';galleryDraft=null;galleryView?.destroy();galleryView=null;galleryChecks=[];pageMediaUrl='';$('pageVideos').replaceChildren();controls();$('error').textContent='';$('captureStatus').textContent='';mediaStatus(target==='gallery'?'正在获取图集，请稍候…':'正在获取视频，请稍候…');
  const url=supportedVideoUrl($('url').value.trim())||webpageUrl($('url').value.trim());
  try {
    if(!url) throw Error('请填写网页、视频或 m3u8/mpd 流媒体的 HTTP/HTTPS 网址。');
    $('url').value=url;
    const directImage=/\.(jpe?g|gif|png|bmp|svg|webp|ico|tiff?|avif)$/i.test(new URL(url).pathname);
    if(directImage&&target==='video'){mediaStatus('这是图片链接，请点击“获取图集”。');return;}
    const capture=!directImage&&(target==='gallery'?videoSite(url)!=='xiaohongshu':options.directMedia!==true&&!supportedVideoUrl(url)&&! /\.(m3u8|mpd|mp4|webm|mov|m4v|mkv)(?:$|[?#])/i.test(url));
    // Request website access within the click gesture, before any other await.
    if(capture&&!(await chrome.permissions.request({origins:[new URL(url).origin+'/*']})))throw Error('请允许读取当前网站，才能获取页面中的图片和视频。');
    const data=directImage?await send('video-image-preview',{url}):capture?await send('video-page-media',{url,mediaKind:target,windowId:(await chrome.windows.getCurrent()).id}):await send('video-info',{url});
    if($('url').value.trim()!==url)return;
    $('title').textContent=data.title&&data.title!==websiteName(url)?data.title:'';$('title').title=$('title').textContent;
    if(capture&&target==='video'){
      pageMediaUrl=url;
      for(const item of data.videos||[]){const button=document.createElement('button');button.textContent='视频 · '+(item.label||new URL(item.url).pathname.split('/').pop()||item.type||'查看画质');button.title=item.url;button.addEventListener('click',async()=>{if(busy)return;try{const w=await chrome.windows.getCurrent();await chrome.storage.session.set({[`video-source:${w.id}`]:{url:item.url,referer:url}});useVideoUrl(item.url);await inspectVideo({directMedia:true});}catch(e){$('error').textContent=e.message;}});$('pageVideos').append(button);}
      mediaStatus(data.videos?.length?'请选择上方视频查看下载选项':'未找到可下载的网页视频。图片请点击“获取图集”；请确认网页中有可访问的视频直链。');return;
    }
    if(target==='video'&&data.kind==='gallery'){mediaStatus('此链接返回的是图集，请点击“获取图集”。');return;}
    if(target==='gallery'&&data.kind!=='gallery'){mediaStatus(capture?'未找到可下载的网页图片。请打开目标网页，等待图片加载后重试。':'此链接返回的是视频，请点击“获取视频”。');return;}
    parsedUrl=url;
    if(data.kind==='gallery'){
      showGallery(data);
      mediaStatus('图集已获取',data.sourceKind==='webpage'?'已获取当前网页图片。若有遗漏，先滚动网页加载图片，再重新获取。':'请选择图片后确认下载');return;
    }
    $('height').replaceChildren(...(data.qualities?.length?data.qualities:data.heights.map(height=>({height,label:height===0?'最佳可用画质（含原始视频）':height+'p'}))).map(q=>{const o=document.createElement('option');o.value=q.height;o.dataset.quality=q.quality??'';o.textContent=q.label;return o;}));
    const notice=videoSite(url)==='bilibili'&&!data.qualities?.length?'本地程序未返回画质档位，目前只有像素高度。请使用当前代码的管理中心更新 / 修复本地程序，再重新获取视频。':data.qualityNotice||'';
    $('qualityNotice').textContent=notice;$('qualityNotice').hidden=!notice;
    $('height').disabled=false;mediaStatus('视频已获取','请选择画质后下载');
  }catch(error){if(typeof Recovery!=='undefined')Recovery.setError($('error'),error);else $('error').textContent=error.message;mediaStatus('解析失败');}
  finally{busy=false;activeOperation='';controls();}
}
$('inspect').addEventListener('click',()=>inspectVideo({target:'video'}));
$('inspectGallery').addEventListener('click',()=>inspectVideo({target:'gallery'}));
$('browserCookies').addEventListener('click',async()=>{
  busy=true;controls();$('error').textContent='';mediaStatus('正在获取视频所属平台的浏览器登录态…');
  let imported=false;
  try {
    const current=await chrome.windows.getCurrent();
    await send('video-browser-cookies',{windowId:current.id});
    imported=true;parsedUrl='';$('height').disabled=true;
    await settings();mediaStatus('登录态已获取，请输入视频网址后解析');
  } catch(error) { if(typeof Recovery!=='undefined')Recovery.setError($('error'),error);else $('error').textContent=error.message;mediaStatus('获取登录态失败'); }
  finally { busy=false;controls(); }
  if(imported && supportedVideoUrl($('url').value.trim())) await inspectVideo({target:lastMediaTarget});
});
let tasksLoading=false,taskOffset=0,taskRevision=0,taskRefreshPending=false;
function requestTaskRefresh(){
  taskRevision++;setTaskListLoading(true);$('tasksError').textContent='';
  return poll();
}
setTaskListLoading(true);
$('taskFilter').value='unfinished';
async function poll() {
  if(tasksLoading){taskRefreshPending=true;return;}
  clearTimeout(timer);tasksLoading=true;
  const requestedRevision=taskRevision;
  try {
    const requestedFilter=$('taskFilter').value,requestedOffset=taskOffset;
    const data=await send('video-jobs',{statusFilter:requestedFilter,offset:requestedOffset});
    if(requestedRevision!==taskRevision || requestedFilter!==$('taskFilter').value || requestedOffset!==taskOffset)return;
    const items=data.items || [];
    $('tasksError').textContent='';
    const total=data.total ?? items.length;
    if(!items.length && taskOffset>0){taskOffset=Math.max(0,taskOffset-50);taskRefreshPending=true;return;}
    $('tasksSummary').textContent=total?'共 '+total+' 个任务'+(total>50?' · 第 '+(Math.floor(taskOffset/50)+1)+' 页':''):'此状态下暂无任务';
    $('tasksPrevious').disabled=taskOffset===0;$('tasksNext').disabled=taskOffset+items.length>=total;
    const current=items.find(t=>t.id===jobId);taskActive=!!current && ['starting','running'].includes(current.state);controls();
    if(typeof setupTaskBatch==='function')setupTaskBatch(items,send,poll);
    $('tasksList').replaceChildren(...items.map(task=>{
      if(typeof renderTaskCard==='function')return renderTaskCard(task,send,poll);
      const card=document.createElement('article'),title=document.createElement('p'),state=document.createElement('p'),progress=document.createElement('pre');
      card.className='download-task';title.textContent=task.title || task.source || task.siteName || '下载任务';
      state.textContent=({starting:'准备下载',running:'后台下载 / 合并中',completed:'已完成',failed:'已中断 / 失败'})[task.state] || task.state;
      progress.textContent=task.progress || '';const time=document.createElement('p');time.className='hint';time.textContent=task.createdAt?'创建于 '+new Date(task.createdAt).toLocaleString('zh-CN',{hour12:false}):'';card.append(title,time,state,progress);
      if(task.error){const error=document.createElement('p');error.className='task-error';error.textContent=task.error;card.append(error);}
      const actions=document.createElement('div');actions.className='task-actions';
      if(task.canResume){const resume=document.createElement('button');resume.textContent='续传';resume.title='继续下载（断点续传）';resume.addEventListener('click',async()=>{
        resume.disabled=true;
        try{await send('video-resume',{id:task.id});await poll();}catch(error){if(typeof Recovery!=='undefined')Recovery.setError($('tasksError'),error);else $('tasksError').textContent=error.message;resume.disabled=false;}
      });actions.append(resume);}
      const open=document.createElement('button');open.textContent='打开目录';open.title=task.directory || '打开此任务的保存目录';
      open.addEventListener('click',async()=>{
        open.disabled=true;
        try{await send('video-open-task',{id:task.id});$('tasksError').textContent='';}catch(error){if(typeof Recovery!=='undefined')Recovery.setError($('tasksError'),error);else $('tasksError').textContent=error.message;}
        finally{open.disabled=false;}
      });actions.append(open);
      const remove=document.createElement('button');remove.textContent=['running','starting'].includes(task.state)?'停止并删除':'删除';
      remove.addEventListener('click',async()=>{
        remove.disabled=true;clearTimeout(timer);
        try{await send('video-delete',{id:task.id});await poll();}catch(error){if(typeof Recovery!=='undefined')Recovery.setError($('tasksError'),error);else $('tasksError').textContent=error.message;remove.disabled=false;timer=setTimeout(poll,3000);}
      });actions.append(remove);card.append(actions);
      return card;
    }));
   }catch(error){if(requestedRevision===taskRevision)$('tasksError').textContent='任务读取失败：'+error.message+'，可点击刷新重试。';}
  finally{
    tasksLoading=false;
    if(taskRefreshPending){taskRefreshPending=false;void poll();}
    else{setTaskListLoading(false);timer=setTimeout(poll,3000);}
  }
}
$('refreshTasks').addEventListener('click',requestTaskRefresh);
$('taskFilter').addEventListener('change',()=>{taskOffset=0;requestTaskRefresh();});
$('tasksPrevious').addEventListener('click',()=>{taskOffset=Math.max(0,taskOffset-50);requestTaskRefresh();});
$('tasksNext').addEventListener('click',()=>{taskOffset+=50;requestTaskRefresh();});

function selectGallery(all){for(const index of visibleGalleryIndexes()){if(all)gallerySelected.add(index);else gallerySelected.delete(index);galleryChecks[index].checked=all;}controls();}
$('gallerySelectAll').addEventListener('click',()=>selectGallery(true));
$('gallerySelectNone').addEventListener('click',()=>selectGallery(false));
async function startGallery(indexes,imageFormat='original',dismiss=true){
  if(busy || !galleryDraft || !indexes.length || parsedUrl!==$('url').value.trim())return;
  busy=true;controls();clearTimeout(timer);$('error').textContent='';
  try {
    const data=await send('video-gallery-start',{draftId:galleryDraft.draftId,confirmed:true,selectedIndexes:indexes,imageFormat});
    jobId=data.id;taskActive=true;runningSelection={url:parsedUrl,height:0};
    await chrome.storage.local.set({lastVideoJob:jobId,lastVideoSelection:runningSelection});
    $('directory').textContent=data.directory;mediaStatus('已加入下载任务 · '+(imageFormat==='original'?'原格式':imageFormat.toUpperCase()));
    if(dismiss){galleryDraft=null;parsedUrl='';galleryView?.destroy();galleryView=null;}poll();
  }catch(error){if(typeof Recovery!=='undefined')Recovery.setError($('error'),error);else $('error').textContent=error.message;poll();}
  finally{busy=false;controls();}
}
$('confirmGallery').addEventListener('click',()=>startGallery(selectedGalleryIndexes().sort((a,b)=>a-b)));
$('download').addEventListener('click',async()=>{
  busy=true;controls();clearTimeout(timer);$('error').textContent='';
  try{
    const data=await send('video-start',{url:parsedUrl,height:Number($('height').value),quality:Number($('height').selectedOptions[0]?.dataset.quality)||0,mediaMode:$('mediaMode').value||'video',audioFormat:$('audioFormat').value||'best',title:$('title').textContent?'【'+websiteName(parsedUrl)+'】'+$('title').textContent:''});
    jobId=data.id;taskActive=true;runningSelection={url:parsedUrl,height:Number($('height').value),quality:Number($('height').selectedOptions[0]?.dataset.quality)||0,mediaMode:$('mediaMode').value||'video',audioFormat:$('audioFormat').value||'best'};
    await chrome.storage.local.set({lastVideoJob:jobId,lastVideoSelection:runningSelection});poll();
  }catch(error){if(typeof Recovery!=='undefined')Recovery.setError($('error'),error);else $('error').textContent=error.message;poll();}
  finally{busy=false;controls();}
});
for(const [id,action] of [['folder','video-folder'],['cookies','video-cookies'],['clearCookies','video-clear-cookies']]){
  $(id).addEventListener('click',async()=>{
    busy=true;controls();$('error').textContent='';
    mediaStatus(id==='folder'?'正在打开系统目录选择框…':id==='cookies'?'正在打开 Cookie 文件选择框…':'正在保存设置…');
    try{const data=await send(action,{directory:$('directoryInput').value});if(!data.cancelled && ['cookies','clearCookies'].includes(id)){parsedUrl='';$('height').disabled=true;}await settings();mediaStatus(data.cancelled?'已取消选择':'设置已保存');}
    catch(error){if(typeof Recovery!=='undefined')Recovery.setError($('error'),error);else $('error').textContent=error.message;mediaStatus('设置失败');}
    finally{busy=false;controls();}
  });
}
(async()=>{try{await settings();mediaStatus('下载引擎已就绪');const data=await chrome.storage.local.get(['lastVideoJob','lastVideoSelection']);if(data.lastVideoJob){jobId=data.lastVideoJob;runningSelection=data.lastVideoSelection;}await poll();}catch(error){if(typeof Recovery!=='undefined')Recovery.setError($('error'),error);else $('error').textContent=error.message;mediaStatus('本地程序检查失败');}})();
