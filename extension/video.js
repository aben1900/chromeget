const $ = id => document.getElementById(id);
let galleryDraft=null, gallerySelected=new Set(), galleryChecks=[];
let parsedUrl='', busy=false, timer, jobId, taskActive=false, runningSelection;
$('url').value = new URL(location.href).searchParams.get('url') || '';
function useVideoUrl(url) {
  if (!webpageUrl(url) || url === $('url').value) return;
  $('url').value=url; parsedUrl=''; $('title').textContent=''; $('height').disabled=true; controls();
}
chrome.windows.getCurrent().then(async current => {
  const key = `video-url:${current.id}`;
  let received = false;
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'session' && changes[key]) { received = true; useVideoUrl(changes[key].newValue); }
  });
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
    $('status').textContent='已提取 '+websiteName(url)+' 的网址';
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
  $('website').textContent=source ? '来源网站：'+source+(platform?'':' · 通用视频解析') : '来源网站：待提取';
  const name=platform==='x'?'X':platform==='youtube'?'YouTube':platform==='toutiao'?'头条':platform==='xiaohongshu'?'小红书':platform==='bilibili'?'B 站':'';
  $('browserCookies').textContent=name?'一键获取本浏览器的'+name+'登录态':'先填写视频网址，再获取登录态';
  for(const id of ['inspect','folder','saveFolder','cookies','clearCookies','browserCookies','extractUrl'])$(id).disabled=busy;
  for(const id of ['browserCookies','cookies','clearCookies'])$(id).disabled=busy || !platform;
  const galleryActive=galleryDraft && parsedUrl===$('url').value.trim();
  $('galleryCard').hidden=!galleryActive;
  $('qualityCard').hidden=!!galleryActive;
  $('download').hidden=!!galleryActive;
  $('confirmGallery').disabled=busy || !galleryActive || !gallerySelected.size;
  $('gallerySelectAll').disabled=busy;$('gallerySelectNone').disabled=busy;
  for(const check of galleryChecks)check.disabled=busy;
  if(galleryActive){$('galleryCount').textContent='共 '+galleryDraft.images.length+' 张 · 已选 '+gallerySelected.size+' 张';$('confirmGallery').textContent='确认下载所选 '+gallerySelected.size+' 张图片';}
  const audio=$('mediaMode').value==='audio';$('audioOptions').hidden=!audio;$('videoQuality').hidden=audio;$('height').disabled=busy||audio||!parsedUrl;$('mediaMode').disabled=busy;$('audioFormat').disabled=busy;
  const duplicate=taskActive && runningSelection?.url===parsedUrl && runningSelection?.height===Number($('height').value)&&(runningSelection?.mediaMode||'video')===($('mediaMode').value||'video')&&(runningSelection?.audioFormat||'best')===($('audioFormat').value||'best');
  $('download').disabled=busy || duplicate || !parsedUrl || parsedUrl!==$('url').value.trim();
  $('download').textContent=busy?'正在处理…':duplicate?'该画质正在下载':!parsedUrl || parsedUrl!==$('url').value.trim()?'请先解析媒体':'开始下载';
}
async function settings() {
  const data=await send('video-status');$('directory').textContent=data.directory;
  $('directoryInput').value=data.directory;
  $('galleryDestination').textContent='保存至：'+data.directory+'（自动新建图集文件夹）';
  $('cookieStatus').textContent=!videoSite($('url').value)?'通用解析不读取浏览器登录态':data.cookies?'已启用当前平台的本机登录态':'未使用 Cookie';
}
$('url').addEventListener('input',()=>{if(parsedUrl!==$('url').value.trim())$('title').textContent='';controls();$('cookieStatus').textContent='登录态按平台分别保存，解析时自动使用';});
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
async function inspectVideo() {
  busy=true;parsedUrl='';galleryDraft=null;controls();$('error').textContent='';$('status').textContent='正在解析…';
  const url=supportedVideoUrl($('url').value.trim())||webpageUrl($('url').value.trim());
  try {
    if(!url) throw Error('请填写视频详情页或 m3u8/mpd 流媒体清单的 HTTP/HTTPS 网址。');
    $('url').value=url;
    const data=await send('video-info',{url});parsedUrl=url;$('title').textContent='【'+websiteName(url)+'】'+data.title;
    if(data.kind==='gallery'){
      galleryDraft=data;gallerySelected=new Set(data.images.map((_,index)=>index));galleryChecks=[];
      $('galleryCount').textContent='共 '+data.images.length+' 张图片，请确认后下载';
      $('confirmGallery').textContent='确认下载全部 '+data.images.length+' 张图片';
      $('galleryDestination').textContent='保存至：'+data.directory+'（自动新建图集文件夹）';
      $('galleryGrid').replaceChildren(...data.images.map((item,index)=>{
        const figure=document.createElement('figure'),img=document.createElement('img'),caption=document.createElement('figcaption');
        img.src=item.url;img.alt='第 '+(index+1)+' 张';img.loading='lazy';img.referrerPolicy='no-referrer';
        const label=document.createElement('label'),check=document.createElement('input');check.type='checkbox';check.checked=true;check.setAttribute('aria-label','选择第 '+(index+1)+' 张图片');galleryChecks.push(check);
        check.addEventListener('change',()=>{if(check.checked)gallerySelected.add(index);else gallerySelected.delete(index);controls();});
        caption.textContent='第 '+(index+1)+' 张';label.append(img,check,caption);figure.append(label);return figure;
      }));
      $('status').textContent='图集已获取，等待确认下载';return;
    }
    $('height').replaceChildren(...data.heights.map(h=>{const o=document.createElement('option');o.value=h;o.textContent=h===0?'最佳可用画质（含原始视频）':h+'p';return o;}));
    $('height').disabled=false;$('status').textContent='请选择分辨率后下载';
  }catch(error){if(typeof Recovery!=='undefined')Recovery.setError($('error'),error);else $('error').textContent=error.message;$('status').textContent='解析失败';}
  finally{busy=false;controls();}
}
$('inspect').addEventListener('click',inspectVideo);
$('browserCookies').addEventListener('click',async()=>{
  busy=true;controls();$('error').textContent='';$('status').textContent='正在获取视频所属平台的浏览器登录态…';
  let imported=false;
  try {
    const current=await chrome.windows.getCurrent();
    await send('video-browser-cookies',{windowId:current.id});
    imported=true;parsedUrl='';$('height').disabled=true;
    await settings();$('status').textContent='登录态已获取，请输入视频网址后解析';
  } catch(error) { if(typeof Recovery!=='undefined')Recovery.setError($('error'),error);else $('error').textContent=error.message;$('status').textContent='获取登录态失败'; }
  finally { busy=false;controls(); }
  if(imported && supportedVideoUrl($('url').value.trim())) await inspectVideo();
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

function selectGallery(all){gallerySelected=new Set(all?galleryChecks.map((_,i)=>i):[]);galleryChecks.forEach(check=>check.checked=all);controls();}
$('gallerySelectAll').addEventListener('click',()=>selectGallery(true));
$('gallerySelectNone').addEventListener('click',()=>selectGallery(false));
$('confirmGallery').addEventListener('click',async()=>{
  if(!galleryDraft || !gallerySelected.size || parsedUrl!==$('url').value.trim())return;
  busy=true;controls();clearTimeout(timer);$('error').textContent='';
  try {
    const data=await send('video-gallery-start',{draftId:galleryDraft.draftId,confirmed:true,selectedIndexes:[...gallerySelected].sort((a,b)=>a-b)});
    jobId=data.id;taskActive=true;runningSelection={url:parsedUrl,height:0};
    await chrome.storage.local.set({lastVideoJob:jobId,lastVideoSelection:runningSelection});
    $('directory').textContent=data.directory;galleryDraft=null;parsedUrl='';poll();
  }catch(error){if(typeof Recovery!=='undefined')Recovery.setError($('error'),error);else $('error').textContent=error.message;poll();}
  finally{busy=false;controls();}
});
$('download').addEventListener('click',async()=>{
  busy=true;controls();clearTimeout(timer);$('error').textContent='';
  try{
    const data=await send('video-start',{url:parsedUrl,height:Number($('height').value),mediaMode:$('mediaMode').value||'video',audioFormat:$('audioFormat').value||'best',title:$('title').textContent});
    jobId=data.id;taskActive=true;runningSelection={url:parsedUrl,height:Number($('height').value),mediaMode:$('mediaMode').value||'video',audioFormat:$('audioFormat').value||'best'};
    await chrome.storage.local.set({lastVideoJob:jobId,lastVideoSelection:runningSelection});poll();
  }catch(error){if(typeof Recovery!=='undefined')Recovery.setError($('error'),error);else $('error').textContent=error.message;poll();}
  finally{busy=false;controls();}
});
for(const [id,action] of [['folder','video-folder'],['saveFolder','video-set-folder'],['cookies','video-cookies'],['clearCookies','video-clear-cookies']]){
  $(id).addEventListener('click',async()=>{
    busy=true;controls();$('error').textContent='';
    $('status').textContent=id==='folder'?'正在打开系统目录选择框…':id==='cookies'?'正在打开 Cookie 文件选择框…':'正在保存设置…';
    try{const data=await send(action,{directory:$('directoryInput').value});if(!data.cancelled && ['cookies','clearCookies'].includes(id)){parsedUrl='';$('height').disabled=true;}await settings();$('status').textContent=data.cancelled?'已取消选择':'设置已保存';}
    catch(error){if(typeof Recovery!=='undefined')Recovery.setError($('error'),error);else $('error').textContent=error.message;$('status').textContent='设置失败';}
    finally{busy=false;controls();}
  });
}
(async()=>{try{await settings();$('status').textContent='下载引擎已就绪';const data=await chrome.storage.local.get(['lastVideoJob','lastVideoSelection']);if(data.lastVideoJob){jobId=data.lastVideoJob;runningSelection=data.lastVideoSelection;}await poll();}catch(error){if(typeof Recovery!=='undefined')Recovery.setError($('error'),error);else $('error').textContent=error.message;$('status').textContent='本地程序检查失败';}})();
