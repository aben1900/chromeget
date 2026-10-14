(() => {
 const $=id=>document.getElementById(id),box=$('connectionPanel'),version=chrome.runtime.getManifest().version;
 let report=null,checking=false,saveBusy=false,pendingCount=0,pendingKnown=true;
 const channel=typeof BroadcastChannel==='function'?new BroadcastChannel('chromeget-connection-status'):null;
 if(channel&&location.pathname.endsWith('/app.html'))channel.onmessage=event=>{if(event.data?.report){report=event.data.report;render();}};
 if($('extensionVersion'))$('extensionVersion').textContent='v'+version;$('connectionId').value=chrome.runtime.id;
 const checkNames={browser:'Chrome 连接',registration:'安装绑定',manifest:'启动路径',host:'程序文件',extension:'扩展授权',directory:'保存目录',engines:'下载组件',integrity:'文件校验',save:'保存设置',diagnostics:'安装检查',version:'更新能力'};
 const captureCapabilities=['capture-ocr-v1','capture-save-v1','ai-vision-test-v1'];
 function card(name,state,text){$(name+'Card').dataset.state=state;$(name+'State').textContent=(state==='pass'?'✓ ':state==='fail'?'✕ ':'○ ')+text;}
 function render(){
  const r=report,connected=!!r?.connected,checks=r?.checks||[],failed=checks.filter(c=>c.state==='fail');
  const missing=connected&&['bookmark-metadata-v1',...captureCapabilities].some(c=>!r.capabilities?.includes(c));
  const canAttemptSave=connected&&r.storageFormat==='json'&&!failed.some(c=>['directory','save','host'].includes(c.id));
  const saving=canAttemptSave&&checks.some(c=>c.id==='directory'&&c.state==='pass');
  let title='正在检查',detail='',state='checking';
  if(!checking&&r){
   if(!connected){title='尚未连接';detail='安装本地程序后重新检查。';state='unavailable'}
   else if(canAttemptSave&&!saving){title='保存位置待确认';detail='可尝试补存，或检查保存目录。';state='unavailable'}
   else if(!saving){title='保存不可用';detail='请在管理中心检查保存目录。';state='unavailable'}
   else if(failed.length){title='需要修复';detail='可以保存，请处理未通过项目。';state='attention'}
   else if(missing){title='需要更新';detail='本地程序缺少新功能。';state='attention'}
   else{title='可以使用';state='ready'}
  }
  box.dataset.state=state;$('connectionConclusion').textContent=title;$('connectionExplanation').textContent=detail;
  const downloadFailed=failed.some(c=>['engines','integrity'].includes(c.id));
  $('connectionNextStep').textContent=state==='ready'?'可以开始使用。只有下载异常时才需要在第 2 步手动校验；日常无需运行“开始使用.cmd”。':state==='checking'?'等待自动检查完成。':!connected?'连接未通过：运行“开始使用.cmd”，在管理中心安装并连接 Chrome。':!saving?'保存未通过：在管理中心更换保存目录，然后刷新第 1 步。':downloadFailed?'下载组件未通过：查看第 2 步的结果，运行“开始使用.cmd → 更新 / 修复”。':failed.length?'基础检查未通过：查看第 1 步的连接与保存明细，再按下方方法处理。':'功能版本不匹配：运行“开始使用.cmd → 更新 / 修复”，重新加载扩展后刷新。';
  $('connectionIndicatorPath').setAttribute('d',state==='ready'?'M5 12l4 4L19 6':state==='unavailable'?'M6 6l12 12M18 6L6 18':state==='attention'?'M12 5v9M12 18h.01':'M12 5v7l4 2');
  document.dispatchEvent(new CustomEvent('connection-state',{detail:{state,title}}));
  const waiting=checking||!r,engines=checks.find(c=>c.id==='engines'),integrity=checks.find(c=>c.id==='integrity');
  card('connectionLink',waiting?'pending':connected?'pass':'fail',waiting?'待检查':connected?'已连接':'未连接');
  card('connectionStorage',waiting?'pending':saving?'pass':canAttemptSave?'pending':'fail',waiting?'待检查':saving?'可保存':canAttemptSave?'待确认':'不可用');
  const downloadState=waiting?'pending':!connected||engines?.state==='fail'?'fail':engines?.state==='pass'?'pass':'pending';
  card('connectionDownload',downloadState,waiting?'待检查':!connected?'未连接':engines?.state==='fail'?'文件缺失':downloadState==='pass'?'组件齐全':'待检查');
  card('connectionIntegrity',waiting?'pending':integrity?.state==='pass'?'pass':integrity?.state==='fail'?'fail':'pending',waiting?'待检查':integrity?.state==='pass'?'校验通过':integrity?.state==='fail'?'校验失败':'尚未校验');
  $('connectionDownloadDetail').textContent=engines?.state==='fail'?engines.message||'缺少下载组件文件。':'检查 Node、yt-dlp、aria2 和 FFmpeg 是否存在';
  $('connectionIntegrityDetail').textContent=integrity?.state==='fail'?integrity.message||'文件与安装记录不一致。':integrity?.state==='pass'?'文件与固定版本安装记录一致':'按需运行，不会修改文件';
  const captureReady=connected&&captureCapabilities.every(c=>r.capabilities?.includes(c));
  card('connectionCapture',waiting?'pending':captureReady?'pass':connected?'pending':'fail',waiting?'待检查':!connected?'未连接':captureReady?'已支持':'需更新');
  $('connectionPending').hidden=pendingKnown&&pendingCount===0;
  $('connectionSaveState').textContent=pendingKnown?pendingCount+' 条待保存':'待保存状态未确认';
  $('retryPending').hidden=!pendingCount;$('retryPending').textContent=saveBusy?'保存中…':'补存';$('retryPending').disabled=saveBusy||checking||!canAttemptSave;
  $('checkConnection').disabled=$('fullConnectionCheck').disabled=checking||saveBusy;
  $('connectionRepair').hidden=waiting||state==='ready';$('connectionRepair').textContent='查看处理方法';
  $('connectionRepair').disabled=checking||saveBusy;
  const basicChecks=checks.filter(c=>!['engines','integrity'].includes(c.id)),basicFailed=basicChecks.filter(c=>c.state==='fail');
  $('checkDetailsSummary').textContent='连接与保存明细'+(basicFailed.length?' · '+basicFailed.length+' 项待处理':'');
  $('connectionChecks').replaceChildren();
  for(const check of basicChecks){const li=document.createElement('li'),label=document.createElement('span'),status=document.createElement('span');li.dataset.check=check.id;li.dataset.state=check.state;label.textContent=checkNames[check.id]||'其他检查';status.textContent=check.state==='pass'?'✓ 通过':check.state==='fail'?'✕ 未通过':'待检查';status.setAttribute('aria-label',check.state==='pass'?'通过':check.state==='fail'?'未通过':'待检查');li.title=check.message||'';li.append(label,status);if(check.message){const reason=document.createElement('small');reason.textContent=check.message;li.append(reason)}$('connectionChecks').append(li)}
  $('connectionActiveVersion').textContent='v'+version;$('connectionDiskVersion').textContent=r?.diskExtensionVersion?'v'+r.diskExtensionVersion:'未确认';
  $('nativeVersion').textContent=r?.hostVersion?'v'+r.hostVersion:'未连接';
  for(const [id,key] of [['connectionNodeVersion','node'],['connectionYtdlpVersion','yt-dlp'],['connectionAria2Version','aria2'],['connectionFfmpegVersion','ffmpeg']])$(id).textContent=r?.engineVersions?.[key]?'v'+r.engineVersions[key]:'未确认';
  const missingVersions=connected&&['node','yt-dlp','aria2','ffmpeg'].some(key=>!r?.engineVersions?.[key]);
  $('connectionVersionsNote').textContent=missingVersions?'本地程序尚未返回部分组件版本。先在 Chrome 中重新加载扩展；若仍未显示，再运行“开始使用.cmd → 更新 / 修复”。':'任务运行支撑下载；视频解析寻找媒体；文件下载负责传输；音视频处理负责合并。版本来自安装记录，文件校验会确认记录与文件一致。';
  $('versionRelationship').textContent=!connected?'尚未连接本地程序':r.diskExtensionVersion&&r.diskExtensionVersion!==version?'磁盘扩展已更新，请在 Chrome 中重新加载扩展':r.hostVersion!==version||missing?'扩展与本地程序不匹配，请更新 / 修复':'扩展与本地程序版本一致';
  $('connectionSavePath').textContent=/\.json$/i.test(r?.journalPath||'')?r.journalPath:'未确认';
  $('connectionHostPath').textContent=r?.hostPath||r?.extensionRoot||'未确认';
 }
 async function updatePending(){try{const {pending=[]}=await chrome.storage.local.get('pending');pendingCount=pending.length;pendingKnown=true;}catch{pendingKnown=false;}render();}
 async function check(fullIntegrity=false){
  if(checking||saveBusy)return;checking=true;render();$('connectionActionStatus').textContent=fullIntegrity?'正在校验…':'';
  try{report=await chrome.runtime.sendMessage({action:'check-connection',fullIntegrity});if(location.pathname.endsWith('/connection-window.html'))channel?.postMessage({report});await updatePending();$('checkConnection').title='上次检查：'+new Date().toLocaleTimeString();$('connectionActionStatus').textContent=fullIntegrity?(report?.checks?.find(c=>c.id==='integrity')?.state==='pass'?'校验通过：下载组件文件与安装记录一致。':'校验未通过：查看本步骤的文件状态，再按第 3 步修复。'):'';}
  catch{report={connected:false};$('connectionActionStatus').textContent='检查未完成，请重试。';}finally{checking=false;render();}
 }
 $('checkConnection').onclick=()=>check(false);$('fullConnectionCheck').onclick=()=>check(true);
 $('connectionRepair').onclick=()=>{$('setupGuide').open=true;$('setupGuide').scrollIntoView({block:'nearest'});};
 $('setupGuide').addEventListener('toggle',()=>$('connectionRepair').setAttribute('aria-expanded',String($('setupGuide').open)));
 $('retryPending').onclick=async()=>{if(saveBusy||checking)return;saveBusy=true;render();try{const r=await chrome.runtime.sendMessage({action:'retry-pending'});$('connectionActionStatus').textContent=r?.ok?'已保存。':r?.error||'保存未完成，请先处理连接问题。';}catch{$('connectionActionStatus').textContent='保存结果待确认，请重新检查。';}finally{saveBusy=false;await updatePending();}};
 $('copyConnectionId').onclick=async()=>{try{await navigator.clipboard.writeText(chrome.runtime.id);$('copyHint').textContent='已复制。';}catch{$('connectionId').select();$('copyHint').textContent='按 Ctrl+C 复制。';}};
 $('openExtensions').onclick=()=>chrome.tabs.create({url:'chrome://extensions/'}).catch(()=>{$('connectionActionStatus').textContent='在地址栏打开 chrome://extensions。';});
 chrome.storage.onChanged.addListener((changes,area)=>{if(area==='local'&&changes.pending)updatePending();if(area==='session'&&changes['show-setup']){$('setupGuide').open=true;}});
 check();
})();
