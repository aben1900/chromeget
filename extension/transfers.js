const bytes=n=>{if(!n)return '大小待确定';const u=['B','KB','MB','GB','TB'];const i=Math.min(4,Math.floor(Math.log(n)/Math.log(1024)));return (n/1024**i).toFixed(i?1:0)+' '+u[i];};
let fileDraft=null, fileChecks=[],fileDraftRevision=0;
async function transferTask(button, work){
  button.disabled=true;$('transferError').textContent='';
  try{await work();}catch(e){if(typeof Recovery!=='undefined')Recovery.setError($('transferError'),e);else $('transferError').textContent=e.message;}finally{button.disabled=false;if(button.id==='hfDownload'&&typeof updateFileSelection==='function')updateFileSelection();}
}
$('transferMode').addEventListener('change',()=>transferTask($('transferMode'),async()=>{
  await send('video-transfer-settings',{transferMode:$('transferMode').value});$('transferStatus').textContent='已保存，对新建任务生效。';
}));
send('video-status').then(r=>{$('transferMode').value=r.transferMode||'fast';}).catch(()=>{});
if($('hfInspect')){
$('hfInspect').addEventListener('click',inspectModelFiles);
}
function inspectModelFiles(){return transferTask($('hfInspect'),async()=>{
  const requestRevision=++fileDraftRevision,requestedUrl=$('hfUrl').value.trim();
  fileDraft=null;fileChecks=[];$('hfFiles').replaceChildren();$('hfDownload').disabled=true;
  $('transferStatus').textContent='正在读取仓库文件…';
  let r;try{r=await send('video-hf-info',{url:requestedUrl});}catch(e){if(requestRevision!==fileDraftRevision)return;throw e;}if(requestRevision!==fileDraftRevision)return;fileDraft=r;
  for(const file of r.files){
    const label=document.createElement('label');label.className='file-choice';
    const check=document.createElement('input');check.type='checkbox';check.value=file.index;
    check.addEventListener('change',updateFileSelection);fileChecks.push({check,file});
    const name=document.createElement('span');name.textContent=file.name+' · '+bytes(file.size);label.append(check,name);$('hfFiles').append(label);
  }
  $('transferStatus').textContent=r.title+' · '+r.files.length+' 个文件 · '+bytes(r.totalBytes);updateFileSelection();if(typeof onModelLoaded==='function')onModelLoaded(r);
});}
if($('hfInspect')){
function updateFileSelection(){const selected=fileChecks.filter(x=>x.check.checked);$('hfSelection').textContent='已选 '+selected.length+' 个文件 · '+bytes(selected.reduce((n,x)=>n+x.file.size,0));$('hfDownload').disabled=!selected.length||(typeof directoryReady!=='undefined'&&!directoryReady);$('hfDownload').textContent=selected.length?'下载所选 '+selected.length+' 个文件':'请先勾选要下载的文件';}
for(const [id,checked] of [['hfAll',true],['hfNone',false]])$(id).addEventListener('click',()=>{fileChecks.forEach(x=>x.check.checked=checked);updateFileSelection();});
$('hfUrl').addEventListener('input',()=>{fileDraftRevision++;fileDraft=null;fileChecks=[];$('hfFiles').replaceChildren();updateFileSelection();});
$('hfDownload').addEventListener('click',()=>transferTask($('hfDownload'),async()=>{
  if(!fileDraft)throw Error('请先获取文件清单。');
  const result=await send('video-file-start',{draftId:fileDraft.draftId,selectedIndexes:fileChecks.filter(x=>x.check.checked).map(x=>x.file.index),confirmed:true});
  $('transferStatus').textContent=result.reused?'已定位包含所选文件的运行任务。':'文件下载已交给后台，可在任务列表查看。';await poll();if(typeof focusTaskList==='function')focusTaskList();
}));
}
if($('sniffStart')){
async function sniffSend(action,extra={}){const current=await chrome.windows.getCurrent();return send(action,{windowId:current.id,...extra});}
async function renderSniff(){
  const r=await sniffSend('video-sniff-list');$('sniffStatus').textContent=(r.active?'捕获中（10 分钟）':'未开启捕获')+' · '+r.resources.length+' 个媒体资源';$('sniffResources').replaceChildren();
  for(const resource of r.resources){
    const row=document.createElement('div');row.className='sniff-resource';const name=document.createElement('p');
    const uri=new URL(resource.url);name.textContent=uri.hostname+' / '+uri.pathname.split('/').pop()+' · '+bytes(resource.size);name.title=resource.url;
    const button=document.createElement('button');button.textContent=resource.kind==='manifest'?'解析流媒体':'下载此资源';
    button.addEventListener('click',()=>transferTask(button,async()=>{
      if(resource.kind==='manifest'){const w=await chrome.windows.getCurrent();await chrome.storage.session.set({[`video-source:${w.id}`]:{url:resource.url,referer:r.page}});useVideoUrl(resource.url);$('inspect').click();return;}
      await sniffSend('video-sniff-download',{resourceId:resource.id});$('transferStatus').textContent='资源下载已提交后台。';await poll();
    }));row.append(name,button);$('sniffResources').append(row);
  }
}
$('sniffStart').addEventListener('click',()=>{
  // permissions.request must run directly in the user gesture.
  const permission=chrome.permissions.request({origins:['https://*/*','http://*/*']});
  transferTask($('sniffStart'),async()=>{if(!await permission)throw Error('未授权网页访问，无法嗅探媒体。');await sniffSend('video-sniff-start');await renderSniff();});
});
$('sniffRefresh').addEventListener('click',()=>transferTask($('sniffRefresh'),renderSniff));
$('sniffStop').addEventListener('click',()=>transferTask($('sniffStop'),async()=>{await sniffSend('video-sniff-stop');await renderSniff();}));

}

if($('hoverEnable')){
  chrome.storage.local.get('hoverDownloadEnabled').then(d=>$('hoverStatus').textContent=d.hoverDownloadEnabled?'悬浮按钮已开启':'悬浮按钮已关闭');
  $('hoverEnable').addEventListener('click',()=>{
    const permission=chrome.permissions.request({origins:['http://*/*','https://*/*']});
    transferTask($('hoverEnable'),async()=>{if(!await permission)throw Error('未授权，无法显示网页按钮。');const w=await chrome.windows.getCurrent();await send('hover-download-set',{enabled:true,windowId:w.id});$('hoverStatus').textContent='已开启，移到当前网页的视频上即可使用。';});
  });
  $('hoverDisable').addEventListener('click',()=>transferTask($('hoverDisable'),async()=>{const w=await chrome.windows.getCurrent();await send('hover-download-set',{enabled:false,windowId:w.id});$('hoverStatus').textContent='已关闭悬浮按钮';}));
}

if($('saveDownloadSettings')){
  send('video-status').then(r=>{$('maxActive').value=String(r.maxActive||3);$('autoClassify').checked=!!r.autoClassify;$('adaptive').checked=r.adaptive!==false;}).catch(()=>{});
  $('saveDownloadSettings').addEventListener('click',()=>transferTask($('saveDownloadSettings'),async()=>{await send('video-transfer-settings',{transferMode:$('transferMode').value,maxActive:Number($('maxActive').value),autoClassify:$('autoClassify').checked,adaptive:$('adaptive').checked});$('transferStatus').textContent='队列和下载设置已保存。';if($('destinationHint'))$('destinationHint').textContent=$('autoClassify').checked?'已开启自动分类，将保存到对应类型的子文件夹。':'';await poll();}));
}

if(typeof initializeDownloadPage==='function')initializeDownloadPage();
