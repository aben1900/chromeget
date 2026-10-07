const $=id=>document.getElementById(id);
let timer,downloadWindowId,recognitionTimer,recognitionId=0,prepared=null,probeBusy=false,submitBusy=false,directoryReady=false,queuedUrl='';
async function send(action,extra={}){
  let timeout;const wait=action==='video-folder'?300000:action==='video-hf-info'?110000:action==='video-file-probe'?25000:25000;
  try{const r=await Promise.race([chrome.runtime.sendMessage({action,...extra}),new Promise((_,reject)=>{timeout=setTimeout(()=>reject(Error('等待本地程序超时，请重试。已提交的下载可在下方任务中查看。')),wait);})]);if(!r?.ok)throw Error(r?.error||'本地程序未响应');return r;}finally{clearTimeout(timeout);}
}
function inputUrl(){let v=$('fileUrl').value.trim();if(/^www\./i.test(v))v='https://'+v;return /\s/.test(v)?'':webpageUrl(v);}
function safeName(value){let name=String(value||'').replace(/[\\/:*?"<>|\x00-\x1f]/g,'_').replace(/[ .]+$/,'').slice(0,140);if(/^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\.|$)/i.test(name))name='_'+name;return name;}
function suggestedName(url){try{return safeName(decodeURIComponent(new URL(url).pathname.split('/').pop()))||'下载文件';}catch{return '下载文件';}}
function refreshDownloadButton(){
  const b=$('fileDownload'),url=inputUrl();b.hidden=prepared?.kind==='model';
  b.disabled=submitBusy||probeBusy||!url||(!directoryReady&&prepared?.kind==='file');
  b.textContent=submitBusy?'正在加入下载…':probeBusy?'正在识别链接…':queuedUrl&&queuedUrl===url?'查看下载任务':!url?'先粘贴一个链接':!prepared?'识别链接':prepared.kind==='video'?'去选择画质 / 图片':prepared.kind==='webpage'?'尝试解析网页中的视频':!directoryReady?'正在读取保存位置…':prepared.unverified?'仍按文件链接下载':'开始下载';
}
function displayPrepared(){
  const p=prepared;$('filePreview').hidden=!p;if(!p){refreshDownloadButton();return;}
  $('previewKind').textContent=p.kind==='model'?'模型仓库':p.kind==='video'?'视频 / 图集':p.kind==='webpage'?'网页链接':'将要下载的文件';
  $('previewName').textContent=p.kind==='file'?($('fileName').value.trim()||p.name):p.name;
  $('previewMeta').textContent=p.meta||new URL(p.url).hostname;$('previewHint').textContent=p.hint||'';refreshDownloadButton();
}
function updateDirectory(path){$('directoryInput').value=path||'';$('directoryDisplay').textContent=path||'尚未设置，点击更改';$('directoryDisplay').title=path||'';directoryReady=!!path;refreshDownloadButton();if(typeof updateFileSelection==='function')updateFileSelection();}
function resetInput(){
  clearTimeout(recognitionTimer);recognitionId++;prepared=null;probeBusy=false;queuedUrl='';$('fileName').value='';$('fileChecksum').value='';$('transferError').textContent='';$('transferStatus').textContent='';$('previewHint').textContent='';$('hfSection').hidden=true;$('hfUrl').value='';$('hfUrl').dispatchEvent(new Event('input'));displayPrepared();
}
function loadLink(url){if(!webpageUrl(url))return;$('fileUrl').value=url;resetInput();recognizeLink();}
async function recognizeLink(){
  clearTimeout(recognitionTimer);const url=inputUrl();if(!url){$('previewHint').textContent=$('fileUrl').value.trim()?'这不是完整的网址，请复制以 https:// 或 http:// 开头的链接。':'';refreshDownloadButton();return;}
  const id=++recognitionId;probeBusy=false;prepared=null;$('hfSection').hidden=true;$('transferError').textContent='';$('previewHint').textContent='';
  const uri=new URL(url);
  if(uri.hostname==='huggingface.co'){
    prepared={url,kind:'model',name:uri.pathname.split('/').filter(Boolean).slice(0,2).join(' / '),hint:'勾选需要的模型文件，再确认下载。'};displayPrepared();$('hfSection').hidden=false;$('hfUrl').value=url;$('hfUrl').dispatchEvent(new Event('input'));inspectModelFiles();return;
  }
  if(supportedVideoUrl(url)||/\.(m3u8|mpd)(?:$|[?#])/i.test(url)){
    prepared={url,kind:'video',name:websiteName(url)+' 的视频或图集',hint:'下一步将在“视频 / 图集”页选择画质或图片，不会直接开始下载。'};displayPrepared();return;
  }
  probeBusy=true;$('filePreview').hidden=true;$('previewHint').textContent='正在读取文件名和大小…';refreshDownloadButton();
  try{
    const r=await send('video-file-probe',{url});if(id!==recognitionId)return;
    const html=/^text\/html/i.test(r.contentType||'')&&!/\.html?$/i.test(uri.pathname);
    prepared={url,kind:html?'webpage':'file',name:safeName(r.filename)||suggestedName(url),meta:(r.sizeKnown?bytes(r.size):'大小由下载时确定')+' · '+(r.host||uri.hostname),hint:html?'这是网页，不是文件直链。可以尝试解析视频，或打开该网页后点击“从本页找文件”。':r.rangeSupported?'可暂停，稍后继续下载。':'服务器不支持续传，中断后可能需要重新下载。'};
  }catch(e){if(id!==recognitionId)return;prepared={url,kind:'file',name:suggestedName(url),meta:uri.hostname+' · 暂时无法读取大小',hint:'未能读取文件信息，可在更多选项中重试识别。确认这是文件链接后，也可直接尝试下载。',unverified:true};$('transferError').textContent=e.message;}
  finally{if(id===recognitionId){probeBusy=false;displayPrepared();}}
}
function onModelLoaded(data){if(prepared?.kind==='model'&&prepared.url===$('hfUrl').value){prepared.name=data.title;prepared.meta=data.files.length+' 个文件 · '+bytes(data.totalBytes);displayPrepared();}}
$('fileUrl').addEventListener('input',()=>{resetInput();if(inputUrl())recognitionTimer=setTimeout(recognizeLink,550);else if($('fileUrl').value.trim())$('previewHint').textContent='请粘贴完整网址，例如 https://example.com/file.zip';});
$('fileUrl').addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();recognizeLink();}});
$('fileName').addEventListener('input',displayPrepared);
let downloadPageInitialized=false;
function initializeDownloadPage(){if(downloadPageInitialized)return;downloadPageInitialized=true;
chrome.windows.getCurrent().then(async w=>{
  downloadWindowId=w.id;const key=`download-link:${w.id}`;let changed=false;
  chrome.storage.onChanged.addListener((changes,area)=>{if(area==='session'&&changes[key]){changed=true;loadLink(changes[key].newValue.url);}});
  const data=(await chrome.storage.session.get(key))[key];if(data&&!changed)loadLink(data.url);
}).catch(e=>$('transferError').textContent=e.message);
}
$('fileDownload').addEventListener('click',async()=>{
  if(submitBusy||probeBusy)return;if(queuedUrl===inputUrl()){focusTaskList();return;}
  if(!prepared||prepared.url!==inputUrl()){await recognizeLink();return;}
  const choice={...prepared};submitBusy=true;refreshDownloadButton();$('transferError').textContent='';
  try{
    if(choice.kind==='video'||choice.kind==='webpage'){
      if(!Number.isInteger(downloadWindowId))downloadWindowId=(await chrome.windows.getCurrent()).id;
      await chrome.storage.session.set({[`video-url:${downloadWindowId}`]:choice.url,[`app-view:${downloadWindowId}`]:'video'});return;
    }
    if(!directoryReady)throw Error('请先选择保存文件夹。');
    await send('video-file-start',{url:choice.url,filename:$('fileName').value.trim()||(choice.name==='下载文件'?'':choice.name),genericFile:true,checksum:$('fileChecksum').value.trim(),confirmed:true});
    queuedUrl=choice.url;$('transferStatus').textContent='已加入下载。可以在下方查看进度、暂停或继续。';await poll();focusTaskList();
  }catch(e){$('transferError').textContent=e.message;}finally{submitBusy=false;refreshDownloadButton();}
});
$('currentLink').addEventListener('click',()=>transferTask($('currentLink'),async()=>{const url=await currentWebpage(downloadWindowId);if(!url)throw Error('请先切换到需要下载内容的网页。');loadLink(url);}));
$('pageLinks').addEventListener('click',()=>{
  const grant=chrome.permissions.request({origins:['http://*/*','https://*/*']});
  transferTask($('pageLinks'),async()=>{
    if(!await grant)throw Error('需要允许读取当前网页，才能帮你找到文件。');
    $('linkResults').hidden=false;$('linkCount').textContent='正在查找网页中的链接…';
    const r=await send('download-page-links',{windowId:downloadWindowId});$('linkList').replaceChildren();
    $('linkCount').textContent=r.links.length?'找到 '+r.links.length+' 个链接，点选一个预览。':'没有找到可用链接。试试右键网页中的下载按钮，复制链接后粘贴到上方。';
    for(const link of r.links){const b=document.createElement('button');b.className='page-link';b.textContent=(link.download?'↓ ':'')+(link.text||link.url);b.title=link.url;b.addEventListener('click',()=>{loadLink(link.url);$('linkResults').hidden=true;if(link.filename)$('fileName').value=safeName(link.filename);});$('linkList').append(b);}
  });
});
for(const [id,action] of [['folder','video-folder'],['saveFolder','video-set-folder']])$(id).addEventListener('click',()=>transferTask($(id),async()=>{
  const r=await send(action,{directory:$('directoryInput').value});if(!r.cancelled){updateDirectory(r.directory);$('transferStatus').textContent='保存位置已更改。';}
}));
send('video-status').then(r=>{updateDirectory(r.directory);$('destinationHint').textContent=r.autoClassify?'已开启自动分类，将保存到对应类型的子文件夹。':'';}).catch(e=>{$('directoryDisplay').textContent='未连接本地程序';$('transferError').textContent=e.message;});
$('probeFile').addEventListener('click',recognizeLink);

$('batchAdd').addEventListener('click',()=>transferTask($('batchAdd'),async()=>{
 const urls=[...new Set($('batchUrls').value.split(/\r?\n/).map(s=>s.trim()).filter(Boolean))];
 if(!urls.length||urls.length>30)throw Error('请填写 1–30 条链接，每行一条。');
 let added=0;const failures=[];
 for(const raw of urls){
  try{
   const url=webpageUrl(raw);if(!url)throw Error('不是 HTTP/HTTPS 链接');const u=new URL(url);
   if(u.hostname==='huggingface.co'&&!/^\/[^/]+\/[^/]+\/resolve\//.test(u.pathname))throw Error('模型仓库请先获取清单并勾选；批量添加请使用 resolve 文件直链');
   if(supportedVideoUrl(url)||/\.(m3u8|mpd)(?:$|[?#])/i.test(url))await send('video-start',{url,height:0,genericMedia:!videoSite(url),title:websiteName(url)+' 视频'});
   else await send('video-file-start',{url,genericFile:true,confirmed:true});
   added++;
  }catch(e){failures.push(raw+'：'+e.message);}
  $('batchResult').textContent=`已加入 ${added}/${urls.length} 条`;
 }
 $('batchResult').textContent=`已加入 ${added} 条`+(failures.length?'；未加入 '+failures.length+' 条：\n'+failures.join('\n'):'');await poll();if(typeof focusTaskList==='function')focusTaskList();
}));
