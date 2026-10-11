(() => {
 const $=id=>document.getElementById(id),box=$('connectionPanel'),version=chrome.runtime.getManifest().version;
 let generation=0,report=null,checking=false,saveBusy=false,pendingCount=0,pendingKnown=true,lastChecked='';
 $('extensionVersion').textContent='v'+version;$('connectionId').value=chrome.runtime.id;
 const checkNames={browser:'浏览器与配套程序连接',registration:'浏览器安装绑定',manifest:'配套程序启动位置',host:'配套程序文件',extension:'当前扩展的使用许可',directory:'摘录保存位置',engines:'下载所需组件',integrity:'下载组件文件校验',save:'读取保存设置',diagnostics:'安装检查',version:'配套程序更新'};
 function render(){
  const r=report,connected=!!r?.connected,failed=(r?.checks||[]).filter(c=>c.state==='fail'),missing=connected&&!r.capabilities?.includes('bookmark-metadata-v1'),canAttemptSave=connected&&r.storageFormat==='json'&&!failed.some(c=>['directory','save','host'].includes(c.id)),saving=connected&&r.storageFormat==='json'&&!failed.some(c=>['directory','save','host'].includes(c.id))&&(r?.checks||[]).some(c=>c.id==='directory'&&c.state==='pass');
  $('nativeVersion').textContent=connected?(r.hostVersion?'v'+r.hostVersion:'版本未能读取'):'尚未连接';
  $('versionRelationship').textContent=connected?'Chrome 已加载 v'+version+' · 磁盘扩展 '+(r.diskExtensionVersion?'v'+r.diskExtensionVersion:'未确认')+' · 本地程序 v'+r.hostVersion+(r.hostVersion===version&&r.diskExtensionVersion===version?' · 三个版本一致':r.diskExtensionVersion&&r.diskExtensionVersion!==version?' · 请重新加载扩展；若仍不同，请检查加载目录':' · 更新尚未完整确认，请运行统一更新后重新检查')+(r.extensionRoot?' · 安装目录：'+r.extensionRoot:''):'尚未连接本地程序';
  $('connectionSavePath').textContent=(/\.json$/i.test(r?.journalPath||'')?r.journalPath:'连接成功后显示实际 JSON 保存文件');
  let title,detail;
  if(!r){title='正在检查是否可以使用…';detail='正在联系电脑上的配套程序。';}
  else if(!connected){title='! 尚未连接，暂时不能保存或下载';detail='需要先安装或修复电脑上的配套程序。展开“安装、更新与修复”，按你的情况操作。';}
  else if(canAttemptSave&&!saving){title='! 已连接，保存位置尚未确认';detail='配套程序未完成保存位置检查。可以尝试补存已有记录；如仍无法保存，请在“开始使用.cmd”中更新 / 修复。';}
  else if(!saving){title='! 保存暂不可用，需要处理';detail='已连接配套程序，但保存设置或目录不可用。打开“开始使用.cmd”，确认保存目录后更新 / 修复。';}
  else if(failed.length){title='! 可以保存，部分功能需要修复';detail='查看下方未通过的项目；下载组件有问题时，在“开始使用.cmd”中更新 / 修复。';}
  else if(missing){title='! 可以保存，部分新功能需要更新';detail='配套程序尚不支持新版网址信息保存。打开新版安装包的“开始使用.cmd”，点击“更新 / 修复”。';}
  else{title='✓ 可以使用';detail='已连接电脑上的配套程序，摘录保存位置可用。下载能否完成仍取决于具体网址。';}
  $('connectionConclusion').textContent=title;$('connectionExplanation').textContent=detail;
  $('connectionSummary').textContent=checking?'正在检查是否可以使用…':title+(pendingCount?' · '+pendingCount+' 条未保存':'');
  box.dataset.state=!r?'checking':!saving?'unavailable':failed.length||missing?'attention':'ready';
  $('connectionSaveState').textContent=!pendingKnown?'未保存记录状态暂时无法读取，请重新检查。':pendingCount?pendingCount+' 条内容尚未写入文件。':'没有待补存记录。';
  $('retryPending').hidden=$('pendingExplanation').hidden=!pendingCount;$('retryPending').textContent=saveBusy?'正在补存…':'补存这 '+pendingCount+' 条';$('retryPending').disabled=saveBusy||checking||!canAttemptSave;
  $('checkConnection').disabled=$('fullConnectionCheck').disabled=checking||saveBusy;
  $('connectionChecks').replaceChildren();
  for(const c of r?.checks||[]){const li=document.createElement('li');li.dataset.check=c.id;li.dataset.state=c.state;li.textContent=(c.state==='pass'?'通过 · ':c.state==='fail'?'需处理 · ':'未检查 · ')+(checkNames[c.id]||'其他检查');if(c.id==='integrity'&&c.state==='pending')li.textContent='可选 · 尚未核对下载组件文件，日常使用不必执行';$('connectionChecks').append(li)}
  if(lastChecked)$('checkConnection').title='上次检查：'+lastChecked;
 }
 async function updatePending(){try{const {pending=[]}=await chrome.storage.local.get('pending');pendingCount=pending.length;pendingKnown=true;render()}catch{pendingKnown=false;render();}}
 async function check(fullIntegrity=false){
  if(checking)return;const token=++generation;checking=true;render();$('connectionActionStatus').textContent=fullIntegrity?'正在核对下载组件文件，请稍候…':'';
  try{report=await chrome.runtime.sendMessage({action:'check-connection',fullIntegrity});if(token!==generation)return;lastChecked=new Date().toLocaleTimeString();if(!report?.connected||report?.checks?.some(c=>c.state==='fail'))box.open=true;await updatePending();$('connectionActionStatus').textContent=fullIntegrity?(report?.checks?.find(c=>c.id==='integrity')?.state==='pass'?'下载组件文件检查通过。':'组件检查未通过或尚未完成，请查看检查项目。'):'检查完成 · '+lastChecked;}
  catch{report={connected:false};box.open=true;$('connectionActionStatus').textContent='检查未完成，请重新打开侧栏后重试。';}finally{checking=false;render();}
 }
 $('checkConnection').onclick=()=>check(false);$('fullConnectionCheck').onclick=()=>check(true);
 $('retryPending').onclick=async()=>{if(saveBusy)return;saveBusy=true;render();try{const r=await chrome.runtime.sendMessage({action:'retry-pending'});$('connectionActionStatus').textContent=r?.ok?'已全部保存到文件。':r?.error||'仍有内容未保存，请先处理连接问题。';}catch{$('connectionActionStatus').textContent='补存结果暂未确认，请重新检查保存状态。';}finally{saveBusy=false;await updatePending();}};
 $('copyConnectionId').onclick=async()=>{try{await navigator.clipboard.writeText(chrome.runtime.id);$('copyHint').textContent='已复制，请粘贴到安装窗口的“扩展 ID”。';}catch{$('connectionId').select();$('copyHint').textContent='请按 Ctrl+C 复制。';}};
 $('openExtensions').onclick=()=>chrome.tabs.create({url:'chrome://extensions/'}).catch(()=>{$('connectionActionStatus').textContent='请在 Chrome 地址栏输入 chrome://extensions。';});
 chrome.storage.onChanged.addListener((changes,area)=>{if(area==='local'&&changes.pending)updatePending();if(area==='session'&&changes['show-setup']){box.open=true;$('setupGuide').open=true;box.scrollIntoView({block:'start'});}});
 check();
})();
