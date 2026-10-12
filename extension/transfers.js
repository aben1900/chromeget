const bytes=n=>{if(!n)return '大小待确定';const u=['B','KB','MB','GB','TB'];const i=Math.min(4,Math.floor(Math.log(n)/Math.log(1024)));return (n/1024**i).toFixed(i?1:0)+' '+u[i];};
let fileDraft=null, fileChecks=[],fileDraftRevision=0;
async function transferTask(button, work){
  const feedback=button.id.startsWith('hover')?$('hoverError'):$('transferError');
  button.disabled=true;feedback.textContent='';
  try{await work();}catch(e){if(typeof Recovery!=='undefined')Recovery.setError(feedback,e);else feedback.textContent=e.message;}finally{button.disabled=false;if(button.id==='hfDownload'&&typeof updateFileSelection==='function')updateFileSelection();}
}
if(!$('fileUrl'))$('transferMode').addEventListener('change',()=>transferTask($('transferMode'),async()=>{
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
function updateFileSelection(){const selected=fileChecks.filter(x=>x.check.checked);$('hfSelection').textContent=selected.length?'已选 '+selected.length+' 项 · '+bytes(selected.reduce((n,x)=>n+x.file.size,0)):'未选择文件';$('hfDownload').disabled=!selected.length||(typeof directoryReady!=='undefined'&&!directoryReady);$('hfDownload').textContent=$('fileUrl')?'下载所选':selected.length?'下载所选 '+selected.length+' 个文件':'请先勾选要下载的文件';}
for(const [id,checked] of [['hfAll',true],['hfNone',false]])$(id).addEventListener('click',()=>{fileChecks.forEach(x=>x.check.checked=checked);updateFileSelection();});
$('hfUrl').addEventListener('input',()=>{fileDraftRevision++;fileDraft=null;fileChecks=[];$('hfFiles').replaceChildren();updateFileSelection();});
$('hfDownload').addEventListener('click',()=>transferTask($('hfDownload'),async()=>{
  if(!fileDraft)throw Error('请先获取文件清单。');
  const result=await send('video-file-start',{draftId:fileDraft.draftId,selectedIndexes:fileChecks.filter(x=>x.check.checked).map(x=>x.file.index),confirmed:true});
  $('transferStatus').textContent=result.reused?'已定位包含所选文件的运行任务。':'文件下载已交给后台，可在任务列表查看。';await poll();if(typeof focusTaskList==='function')focusTaskList();
}));
}
if($('hoverToggle')){
  const toggle=$('hoverToggle');let hoverRevision=0,hoverBusy=false;
  function showHoverState(enabled){hoverRevision++;toggle.setAttribute('aria-pressed',String(!!enabled));toggle.title=enabled?'悬浮下载按钮已开启，点击关闭':'悬浮下载按钮已关闭，点击开启';if(!hoverBusy)toggle.disabled=false;}
  const initialRevision=hoverRevision;
  chrome.storage.local.get('hoverDownloadEnabled').then(d=>{if(initialRevision===hoverRevision)showHoverState(d.hoverDownloadEnabled);}).catch(()=>{toggle.disabled=false;toggle.title='无法读取状态，点击开启悬浮下载按钮';});
  chrome.storage.onChanged.addListener((changes,area)=>{if(area==='local'&&changes.hoverDownloadEnabled)showHoverState(changes.hoverDownloadEnabled.newValue);});
  toggle.addEventListener('click',()=>{
    if(hoverBusy)return;
    const enabled=toggle.getAttribute('aria-pressed')!=='true';
    const permission=enabled?chrome.permissions.request({origins:['http://*/*','https://*/*']}):Promise.resolve(true);
    hoverBusy=true;toggle.setAttribute('aria-busy','true');
    transferTask(toggle,async()=>{if(!await permission)throw Error('未授权，无法显示网页按钮。');const w=await chrome.windows.getCurrent();await send('hover-download-set',{enabled,windowId:w.id});showHoverState(enabled);}).finally(()=>{hoverBusy=false;toggle.removeAttribute('aria-busy');});
  });
}

if($('saveDownloadSettings')){
  send('video-status').then(r=>{$('maxActive').value=String(r.maxActive||3);$('autoClassify').checked=!!r.autoClassify;$('adaptive').checked=r.adaptive!==false;}).catch(()=>{});
  $('saveDownloadSettings').addEventListener('click',()=>transferTask($('saveDownloadSettings'),async()=>{await send('video-transfer-settings',{transferMode:$('transferMode').value,maxActive:Number($('maxActive').value),autoClassify:$('autoClassify').checked,adaptive:$('adaptive').checked});$('transferStatus').textContent='下载设置已保存。';if($('destinationHint'))$('destinationHint').textContent=$('autoClassify').checked?'按文件类型存入子目录':'';await poll();}));
}

if(typeof initializeDownloadPage==='function')initializeDownloadPage();
