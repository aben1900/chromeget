const HOST = 'cn.jingcai.clipper';
importScripts('recovery.js', 'collect-model.js', 'collect-service.js', 'prompt-title.js', 'browser-cookies.js', 'video-url.js', 'sniffer.js', 'page-links.js', 'hover-control.js');
const kinds = {comment: '评论', review: '评阅', content: '内容', prompt: '提示词', link: '网页地址', page: '网页地址'};
let serial = Promise.resolve();
function exclusive(fn) {
  const result = serial.then(fn);
  serial = result.catch(() => {});
  return result;
}
function native(message) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendNativeMessage(HOST, message, response => {
      if (chrome.runtime.lastError) return reject(Recovery.toError({error:chrome.runtime.lastError.message,code:'HOST_UNAVAILABLE'}));
      // AI replies carry their own bounded error codes and optional test receipts.
      if (message.action.startsWith('ai-') && response) return resolve(response);
      if (!response?.ok) return reject(Recovery.toError(response || {error:'本地保存程序没有返回结果'}));
      resolve(response);
    });
  });
}
async function menus() {
  await chrome.contextMenus.removeAll();
  chrome.contextMenus.create({id:'collect',title:'精彩摘录 · 收集并预览',contexts:['selection','link','page']});
  for (const [id, title] of [['comment','保存为评论'], ['review','保存为评阅'], ['content','保存为内容'], ['prompt','保存为提示词']]) {
    chrome.contextMenus.create({id, title: `精彩摘录 · ${title}`, contexts: ['selection']});
  }
  chrome.contextMenus.create({id:'download-link',title:'精彩摘录 · 载入下载链接',contexts:['link','selection']});
  chrome.contextMenus.create({id: 'link', title: '精彩摘录 · 保存此链接地址', contexts: ['link','selection']});
  chrome.contextMenus.create({id: 'page', title: '精彩摘录 · 保存当前网页地址', contexts: ['page']});
  chrome.contextMenus.create({id: 'bili-video', title: '精彩摘录 · 解析视频 / 流媒体', contexts: ['page','video','link'], documentUrlPatterns: ['http://*/*','https://*/*']});
}
async function badge() {
  const {pending = [], lastError = ''} = await chrome.storage.local.get(['pending', 'lastError']);
  await chrome.action.setBadgeBackgroundColor({color: pending.length ? '#c2410c' : '#18705a'});
  await chrome.action.setBadgeText({text: pending.length ? String(pending.length) : '✓'});
  await chrome.action.setTitle({title: pending.length ? `${pending.length} 条待保存：${lastError}` : '精彩摘录 · 已写入本地文件'});
}
async function flush() {
  const {pending = []} = await chrome.storage.local.get('pending');
  while (pending.length) {
    try {
      const status = await native({action: 'status'});
      if (status.storageFormat !== 'json') throw new Error(`实际连接的本地程序未声明 JSON 保存能力（版本：${status.version || '未知'}，路径：${status.hostPath || '未提供'}）。请运行本项目的“开始使用.cmd → 更新 / 修复”。`);
      let duplicate=false;
      if(status.capabilities?.includes('library-v1')){try{const check=await native({action:'library-duplicates',content:pending[0].content,type:pending[0].type});duplicate=check.matches?.length>0;}catch{}}
      const result = await native({action: 'save', record: pending[0]});
      if(duplicate)await chrome.storage.local.set({lastDuplicate:{id:'clip:'+pending[0].id,time:Date.now()}});
      const record=pending.shift();
      const {savedCollect={}}=await chrome.storage.local.get('savedCollect');
      savedCollect[record.id]=Date.now();
      const receipts=Object.fromEntries(Object.entries(savedCollect).sort((a,b)=>b[1]-a[1]).slice(0,200));
      await chrome.storage.local.set({pending,savedCollect:receipts,lastError:'',path:result.journalPath||result.path,lastSaved:new Date().toISOString()});
    } catch (error) {
      await chrome.storage.local.set({lastError: error.message});
      break;
    }
  }
  await badge();
}
chrome.runtime.onInstalled.addListener(() => { menus().then(restoreHoverDownload).catch(console.error); });
chrome.action.onClicked.addListener(tab => {
  if (Number.isInteger(tab.windowId)) chrome.sidePanel.open({windowId:tab.windowId}).catch(console.error);
});
chrome.runtime.onStartup.addListener(() => { exclusive(flush).catch(console.error); restoreHoverDownload().catch(console.error); });
function contextLinkUrl(info){
  const selected=String(info.selectionText||'').trim();
  let value=selected||String(info.linkUrl||'').trim();
  if(/^www\./i.test(value))value='https://'+value;
  if(/\s/.test(value)||!webpageUrl(value))return '';
  return value;
}
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if(info.menuItemId==='collect'&&Number.isInteger(tab?.windowId)){
    chrome.sidePanel.open({windowId:tab.windowId}).catch(console.error);
    exclusive(async()=>{await chrome.storage.session.set({[`collect-draft:${tab.windowId}`]:newCollectDraft(info.selectionText||info.linkUrl||info.pageUrl||tab.url||'',tab),[`app-view:${tab.windowId}`]:'collect'});}).catch(console.error);return;
  }
  const linkAction=['download-link','link'].includes(info.menuItemId);
  const chosenLink=linkAction?contextLinkUrl(info):'';
  if(linkAction&&!chosenLink){
    chrome.action.setBadgeText({text:'!'}).catch(console.error);
    chrome.action.setTitle({title:'请选择一个完整的 HTTP/HTTPS 网址，再使用链接操作。'}).catch(console.error);
    return;
  }
  if(info.menuItemId==='download-link'){
    if(!Number.isInteger(tab?.windowId)||!chosenLink)return;
    chrome.sidePanel.open({windowId:tab.windowId}).catch(console.error);
    chrome.storage.session.set({[`download-link:${tab.windowId}`]:{url:chosenLink,time:Date.now()},[`app-view:${tab.windowId}`]:'download'}).catch(console.error);return;
  }
  if (info.menuItemId === 'bili-video') {
    // Open during the click gesture, before any storage/network await.
    if (!Number.isInteger(tab?.windowId)) return;
    chrome.sidePanel.open({windowId:tab.windowId}).catch(console.error);
    chrome.storage.session.set({[`video-url:${tab.windowId}`]:info.linkUrl || supportedVideoUrl(info.pageUrl||tab?.url) || webpageUrl(info.srcUrl) || info.pageUrl || tab?.url || ''}).catch(console.error);
    chrome.storage.session.set({[`app-view:${tab.windowId}`]:'video'}).catch(console.error);
    return;
  }
  const kind = kinds[info.menuItemId];
  if (!kind) return;
  const content = info.menuItemId === 'link' ? chosenLink : info.menuItemId === 'page' ? (info.pageUrl || tab?.url) : info.selectionText;
  if (!content?.trim()) return;
  const record = {id: crypto.randomUUID(), time: new Date().toISOString(), type: kind, content,sourceUrl:tab?.url||info.pageUrl||'',sourceTitle:tab?.title||''};
  exclusive(async () => {
    if (info.menuItemId === 'prompt') {
      const key = `draft:${record.id}`;
      await chrome.storage.session.set({[key]: {...record, title: summarizePromptTitle(content)}});
      try {
        const dialog = await chrome.windows.create({url: chrome.runtime.getURL(`prompt.html?draft=${record.id}`), type: 'popup', width: 560, height: 580});
        await chrome.storage.session.set({[key]: {...record, title: summarizePromptTitle(content), windowId: dialog.id}});
      } catch (error) {
        await chrome.storage.session.remove(key);
        throw error;
      }
      return;
    }
    await enqueueRecord(record);
  }).catch(async error => {
    await chrome.action.setBadgeText({text: '!'});
    await chrome.action.setTitle({title: `摘录失败：${error.message}`});
  });
});
chrome.runtime.onMessage.addListener((message, sender, reply) => {
  const aiActions=['ai-model-select','ai-models-discover','ai-model-delete','ai-default-set','ai-model-import-preview','ai-model-import-apply','ai-test-draft','ai-settings-get','ai-settings-save','ai-ccswitch-list','ai-test','ai-prepare','ai-generate','ai-status','ai-recent','ai-read','ai-save'];
  if(aiActions.includes(message.action)&&sender.id===chrome.runtime.id&&sender.url?.split(/[?#]/)[0]===chrome.runtime.getURL('library.html')&&(sender.frameId===undefined||sender.frameId===0||sender.frameId===-1)){
    (async()=>{const host=await native({action:'status'});if(!host.capabilities?.includes('ai-config-models-v2'))throw Error('模型管理需要更新本地程序，请运行“开始使用.cmd → 更新 / 修复”');return native(message);})().then(reply,e=>reply({ok:false,error:e.message,code:e.message}));return true;
  }
  const backupActions=['library-backup-create','library-backup-list','library-backup-open','library-restore-choose','library-restore-preview','library-restore-apply','library-restore-result'];
  const libraryActions=[...backupActions,'library-query','library-read','library-update','library-taxonomy','library-duplicates','library-open','library-export-prepare','library-export-start','library-export-status','library-export-recent','library-export-open'];
  if(libraryActions.includes(message.action)&&sender.id===chrome.runtime.id&&sender.url?.split('?')[0]===chrome.runtime.getURL('library.html')){
    const run=async()=>{const host=await native({action:'status'});const capability=backupActions.includes(message.action)?'library-backup-v1':'library-v1';if(!host.capabilities?.includes(capability))throw Error('此功能需要更新本地程序，请运行“开始使用.cmd → 更新 / 修复”');if(message.action==='library-restore-apply'){const {pending=[]}=await chrome.storage.local.get('pending');if(pending.length)throw Error('请先在侧栏重试并保存待处理记录，再恢复备份。');}return native(message);};
    (message.action==='library-restore-apply'?exclusive(run):run()).then(reply,e=>reply(Recovery.response(e)));return true;
  }
  if(['collect-load','collect-edit','collect-save','collect-state','collect-retry'].includes(message.action)&&sender.id===chrome.runtime.id&&sender.url===chrome.runtime.getURL('collect.html')){
    exclusive(()=>collectionRequest(message)).then(reply,error=>reply(Recovery.response(error)));return true;
  }
  if(message.action==='check-connection' && sender.id===chrome.runtime.id && ['app.html','collect.html'].some(p=>sender.url===chrome.runtime.getURL(p))){
    (async()=>{
      let timer;const deadline=new Promise((_,reject)=>{timer=setTimeout(()=>reject(Recovery.toError({code:'HOST_UNAVAILABLE',error:'连接检查超时，请重试'})),12000);});
      try{
        try{
          const report=await Promise.race([native({action:'diagnostics',extensionId:chrome.runtime.id}),deadline]);
          if(!Array.isArray(report.checks))throw Error('unsupported action');
          return {...report,connected:true,checks:[{id:'browser',state:'pass',message:'Chrome 已连接'},...(report.checks||[]).filter(c=>c.id!=='browser')]};
        }catch(e){
          if(e.code==='HOST_UNAVAILABLE')throw e;
          if(/不支持操作|unsupported action|unknown action/i.test(e.message)){
            const host=await Promise.race([native({action:'status'}),deadline]);
            return {ok:true,connected:true,hostVersion:host.version,checks:[{id:'browser',state:'pass',message:'Chrome 已连接'},{id:'version',state:'fail',message:'旧版程序不支持自检，请运行开始使用.cmd → 更新 / 修复'}]};
          }
          return {ok:true,connected:true,checks:[{id:'browser',state:'pass',message:'Chrome 已连接'},{id:'diagnostics',state:'fail',message:'本机检查未完成，请在管理中心检查或修复配置'}]};
        }
      }catch(e){return {...Recovery.response(e),connected:false,checks:[{id:'browser',state:'fail',message:'Chrome 尚未连接本地程序'}]};}finally{clearTimeout(timer);}
    })().then(reply,e=>reply(Recovery.response(e)));return true;
  }
  if(message.action==='page-video-download' && sender.id===chrome.runtime.id && Number.isInteger(sender.tab?.windowId) && sender.frameId===0 && webpageUrl(sender.url)){
    const requestedPage=supportedVideoUrl(message.pageUrl);
    const originName=websiteName(sender.url),targetName=websiteName(requestedPage);
    const selectedPage=requestedPage&&originName===targetName?requestedPage:sender.url;
    const media=webpageUrl(message.mediaUrl),page=supportedVideoUrl(selectedPage)||(/\.(m3u8|mpd)(?:$|[?#])/i.test(media)?media:!media?webpageUrl(sender.url):'');
    if(!page && (!media || !/\.(mp4|webm|mov)(?:$|[?#])/i.test(media))){reply({ok:false,error:'此网页尚不能解析视频；可在下载面板开启媒体嗅探，或使用支持的网站详情页。'});return;}
    // Keep opening the side panel inside the content-script click message gesture.
    const opened=chrome.sidePanel.open({windowId:sender.tab.windowId});
    (async()=>{
      if(!(await chrome.storage.local.get('hoverDownloadEnabled')).hoverDownloadEnabled)throw Error('视频悬浮下载按钮已关闭。');
      await opened;
      await chrome.storage.session.set(page?{[`video-url:${sender.tab.windowId}`]:page,[`video-source:${sender.tab.windowId}`]:{url:page,referer:sender.url},[`app-view:${sender.tab.windowId}`]:'video'}:{[`download-link:${sender.tab.windowId}`]:{url:media,time:Date.now()},[`app-view:${sender.tab.windowId}`]:'download'});
      return {ok:true};
    })().then(reply,e=>reply({ok:false,error:e.message}));return true;
  }

  if (sender.id === chrome.runtime.id && (sender.url === chrome.runtime.getURL('video.html') || sender.url?.startsWith(chrome.runtime.getURL('video.html?')) || sender.url===chrome.runtime.getURL('download.html')) && ['video-status','video-info','video-start','video-job','video-folder','video-set-folder','video-cookies','video-clear-cookies','video-open-recent','video-browser-cookies','video-gallery-start','video-jobs','video-resume','video-delete','video-pause','video-open-task','video-hf-info','video-file-start','video-file-probe','video-transfer-settings','video-sniff-start','video-sniff-list','video-sniff-stop','video-sniff-download','download-page-links','hover-download-set'].includes(message.action)) {
    (async()=>{
      if(message.action==='hover-download-set')return setHoverDownload(message.enabled===true,message.windowId);
      if(message.action==='download-page-links')return downloadPageLinks(message.windowId);
      if(message.action.startsWith('video-sniff-'))return sniffAction(message);
      const host=await native({action:'status'});
      if (!host.capabilities?.includes('video-api-2')) throw Error(`本地程序版本不匹配（${host.version || '未知旧版'}）。请运行本项目的“开始使用.cmd → 更新 / 修复”，然后重新加载扩展。`);
      if (!host.capabilities?.includes('video-multisite')) throw Error('请运行“开始使用.cmd → 更新 / 修复”更新多平台视频功能。');
      if(message.site==='toutiao' && !host.capabilities?.includes('video-toutiao')) throw Error('请运行“开始使用.cmd → 更新 / 修复”更新头条视频下载功能。');
      if (!host.capabilities?.includes('gallery')) throw Error('请运行“开始使用.cmd → 更新 / 修复”更新图集下载功能。');
      if(message.site==='youtube' && !host.capabilities?.includes('video-youtube')) throw Error('请运行开始使用.cmd → 更新 / 修复 更新 YouTube 下载功能。');
      if(['video-jobs','video-resume','video-delete'].includes(message.action) && !host.capabilities?.includes('video-tasks')) throw Error('本机下载程序版本较旧。请运行项目中的“开始使用.cmd → 更新 / 修复”，然后在 chrome://extensions 重新加载扩展；只刷新扩展无法更新本地程序。');
      if(['video-start','video-resume','video-delete'].includes(message.action) && !host.capabilities?.includes('task-reuse')) throw Error('请运行开始使用.cmd → 更新 / 修复 更新任务复用和删除功能。');
      if(message.action==='video-open-task' && !host.capabilities?.includes('task-directory')) throw Error('请运行开始使用.cmd → 更新 / 修复 更新任务目录功能。');
      if(message.action==='video-gallery-start' && !host.capabilities?.includes('gallery-select')) throw Error('请更新本地程序以下载所选图片。');
      if(['video-hf-info','video-file-start','video-file-probe','video-transfer-settings'].includes(message.action) && !host.capabilities?.includes('parallel-files')) throw Error('请运行开始使用.cmd → 更新 / 修复 更新高速下载模块。');
      if(message.genericFile && !host.capabilities?.includes('generic-files'))throw Error('请运行开始使用.cmd → 更新 / 修复 更新普通文件下载功能。');
      if(message.action==='video-pause' && !host.capabilities?.includes('task-progress'))throw Error(`当前连接的本地程序未声明暂停能力（版本：${host.version || '未知'}；路径：${host.hostPath || '未提供'}）。请运行“开始使用.cmd → 更新 / 修复”，然后在 chrome://extensions 重新加载精彩摘录并重新打开侧边栏。更新扩展本身不会更新本地程序。`);
      if((message.action==='video-file-probe'||message.genericMedia||message.maxActive!==undefined) && !host.capabilities?.includes('download-suite'))throw Error('请更新本地程序以使用探测、队列或通用流媒体功能。');
      let cookieText;
      if (message.action === 'video-browser-cookies') {
        if (!host.capabilities?.includes('browser-cookies')) throw Error('请运行“开始使用.cmd → 更新 / 修复”更新本地程序，然后重试获取登录态。');
        cookieText = await currentBiliCookies(message.windowId, videoSite(message.url));
      }
      if(message.transferMode==='extreme'&&!host.capabilities?.includes('range64'))throw Error('请更新本地程序以使用原生 64 路下载。');
      if(message.mediaMode==='audio'&&!host.capabilities?.includes('audio-download'))throw Error('请更新本地程序以使用仅音频下载。');
      const result=await native({action:message.action,url:message.url,height:message.height,mediaMode:message.mediaMode,audioFormat:message.audioFormat,id:message.id,directory:message.directory,site:message.site,cookieText,draftId:message.draftId,confirmed:message.confirmed,selectedIndexes:message.selectedIndexes,title:message.title,statusFilter:message.statusFilter,offset:message.offset,transferMode:message.transferMode,genericFile:message.genericFile,filename:message.filename,checksum:message.checksum,genericMedia:message.genericMedia,referer:message.referer,maxActive:message.maxActive,autoClassify:message.autoClassify,adaptive:message.adaptive});
      if(['video-start','video-gallery-start','video-file-start','video-resume'].includes(message.action)) await chrome.storage.local.set({lastVideoJob:result.id,lastVideoSelection:{url:message.url,height:message.height}});
      return {...result,hostVersion:host.version,hostPath:host.hostPath};
    })().then(reply,error=>reply(Recovery.response(error)));
    return true;
  }
  if (sender.id === chrome.runtime.id && sender.url?.startsWith(chrome.runtime.getURL('prompt.html?draft='))) {
    const id = new URL(sender.url).searchParams.get('draft');
    if (!/^[a-f0-9-]{36}$/.test(id || '')) return;
    const key = `draft:${id}`;
    exclusive(async () => {
      const draft = (await chrome.storage.session.get(key))[key];
      if (!draft) throw new Error('此记录已确认或已取消，请重新选择文字。');
      if (message.action === 'prompt-load') return {ok: true, title: draft.title, content: draft.content};
      if (message.action === 'prompt-cancel') {
        await chrome.storage.session.remove(key);
        return {ok: true};
      }
      if (message.action !== 'prompt-save') throw new Error('不支持的操作');
      const title = typeof message.title === 'string' ? message.title.trim() : '';
      if (!title || title.length > 120 || /[\r\n]/.test(title)) throw new Error('请输入 1–120 字的单行标题。');
      const {pending = []} = await chrome.storage.local.get('pending');
      const {windowId, ...record} = draft;
      pending.push({...record, title});
      await chrome.storage.local.set({pending});
      await chrome.storage.session.remove(key);
      await flush();
      return {ok: true};
    }).then(reply, error => reply({ok: false, error: error.message}));
    return true;
  }
  if (sender.id !== chrome.runtime.id || sender.url !== chrome.runtime.getURL('popup.html')) return;
  if (['list', 'read', 'delete', 'choose-json', 'default-json'].includes(message.action)) {
    exclusive(async () => {
      const status = await native({action:'status'});
      if (!status.capabilities?.includes('choose-json')) throw new Error('本地保存程序版本过旧。请运行本项目的开始使用.cmd 更新，再重新加载扩展。');
      if (message.action === 'choose-json' || message.action === 'default-json') {
        const choice = message.action === 'choose-json' ? await native({action:'choose-json'}) : {journalPath:status.journalPath};
        if (choice.cancelled) return choice;
        const path = message.action === 'default-json' ? undefined : choice.journalPath;
        const result = await native({action:'list', journalPath:path, offset:0});
        await chrome.storage.local.set({libraryPath:path || ''});
        return result;
      }
      const {libraryPath} = await chrome.storage.local.get('libraryPath');
      const journalPath = libraryPath || status.journalPath;
      if (['read','delete'].includes(message.action) && message.journalPath !== journalPath) throw new Error('正在查看的 JSON 已切换，请刷新后再操作。');
      if (message.action === 'delete') {
        await flush();
        const {pending = []} = await chrome.storage.local.get('pending');
        if (pending.length) throw new Error('请先重试并保存待处理记录，再删除，避免记录重试后重新出现。');
        return native({action: 'delete', ids: message.ids, journalPath});
      }
      return native({action: message.action, id: message.id, offset: message.offset, journalPath: libraryPath});
    }).then(reply, error => reply({ok: false, error: error.message}));
    return true;
  }
  if (message.action === 'retry') {
    exclusive(async () => {
      await flush();
      const {pending = [], lastError = ''} = await chrome.storage.local.get(['pending','lastError']);
      return pending.length ? {ok:false,error:lastError || `${pending.length} 条仍未保存`} : {ok:true};
    }).then(reply, error => reply({ok: false, error: error.message}));
    return true;
  }
  if (message.action === 'status') {
    exclusive(async () => {
      const status = await native({action:'status'});
      if (status.storageFormat === 'json') {
        await flush();
        const {pending = []} = await chrome.storage.local.get('pending');
        if (!pending.length) await chrome.storage.local.set({lastError:''});
      }
      return status;
    }).then(reply, error => reply({ok: false, error: error.message}));
    return true;
  }
});
chrome.windows.onRemoved.addListener(windowId => {
  exclusive(async () => {
    const drafts = await chrome.storage.session.get(null);
    const keys = Object.keys(drafts).filter(key => key.startsWith('draft:') && drafts[key].windowId === windowId);
    if (keys.length) await chrome.storage.session.remove(keys);
  }).catch(console.error);
});
