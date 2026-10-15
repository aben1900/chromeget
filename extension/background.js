const HOST = 'cn.jingcai.clipper';
importScripts('free-translation.js', 'recovery.js', 'collect-model.js', 'collect-service.js', 'prompt-title.js', 'browser-cookies.js', 'video-url.js', 'page-links.js', 'page-media.js', 'hover-control.js', 'window-overlay.js');
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
const overlayLifetimeMs=2*60*60*1000;
function topExtensionPage(sender,pages){
  return sender.id===chrome.runtime.id&&(sender.frameId===undefined||sender.frameId===0||sender.frameId===-1)&&pages.some(page=>sender.url?.split(/[?#]/)[0]===chrome.runtime.getURL(page));
}
async function authorizedOverlaySender(sender,tool){
  if(sender.id!==chrome.runtime.id||!Number.isInteger(sender.frameId)||sender.frameId<1||!Number.isInteger(sender.tab?.id))return false;
  const page=tool==='model'?'model-settings.html':'translate.html';
  let target;
  try{target=new URL(sender.url);}catch{return false;}
  if(target.href.split(/[?#]/)[0]!==chrome.runtime.getURL(page))return false;
  const token=target.searchParams.get('overlay');
  if(!token)return false;
  const key='tool-overlay:'+token,receipt=(await chrome.storage.session.get(key))[key];
  return receipt?.tool===tool&&receipt.page===page&&receipt.tabId===sender.tab.id&&receipt.windowId===sender.tab.windowId&&receipt.expiresAt>Date.now();
}
async function renderToolInExtensionTab(tab,url,token,tool,title){
  if(typeof BroadcastChannel==='undefined')return false;
  let channel;try{channel=new BroadcastChannel('chromeget-connection-overlay')}catch{return false}let timer;
  try{
    const ready=new Promise(resolve=>{channel.onmessage=event=>{if(event.data?.type==='ready'&&event.data.token===token)resolve(true)};timer=setTimeout(()=>resolve(false),900)});
    channel.postMessage({type:'prepare',tabId:tab.id,token,url,tool,title});
    if(!await ready)return false;
    channel.postMessage({type:'commit',token});
    return true;
  }catch{return false;
  }finally{clearTimeout(timer);channel.close()}
}
async function openToolOverlay(tool,translationId='',preferredTab,inline=false){
  const tab=Number.isInteger(preferredTab?.id)?preferredTab:(await chrome.tabs.query({active:true,lastFocusedWindow:true}))[0];
  if(!Number.isInteger(tab?.id))throw Error('未找到当前浏览器标签页');
  const page=tool==='model'?'model-settings.html':'translate.html',title=tool==='model'?'模型设置':'比对翻译页';
  const id=translationId?'id='+encodeURIComponent(translationId):'';
  const fallbackUrl=chrome.runtime.getURL(page)+(id?'?'+id:'');
  const token=crypto.randomUUID(),key='tool-overlay:'+token,index='tool-overlay-current:'+tab.id+':'+tool;
  const url=chrome.runtime.getURL(page)+'?overlay='+encodeURIComponent(token)+(id?'&'+id:'');
  const previous=(await chrome.storage.session.get(index))[index];
  await chrome.storage.session.set({[key]:{tool,page,tabId:tab.id,windowId:tab.windowId,expiresAt:Date.now()+overlayLifetimeMs}});
  if(inline){
    await chrome.storage.session.set({[index]:token});
    if(previous&&previous!==token)await chrome.storage.session.remove('tool-overlay:'+previous);
    return {ok:true,render:{url,token,tool,title}};
  }
  if(tab.url?.startsWith(chrome.runtime.getURL(''))&&await renderToolInExtensionTab(tab,url,token,tool,title)){
    await chrome.storage.session.set({[index]:token});
    if(previous&&previous!==token)await chrome.storage.session.remove('tool-overlay:'+previous);
    return {ok:true};
  }
  try{
    const result=await chrome.scripting.executeScript({target:{tabId:tab.id,frameIds:[0]},func:OverlayWindowRender,args:[url,token,tool,title]});
    if(result?.some(item=>item.result===false))throw Error('网页无法显示工具窗口');
    await chrome.storage.session.set({[index]:token});
    if(previous&&previous!==token)await chrome.storage.session.remove('tool-overlay:'+previous);
    return {ok:true};
  }catch(error){
    await chrome.storage.session.remove(key);
    await chrome.tabs.create({url:fallbackUrl,...(Number.isInteger(tab.windowId)?{windowId:tab.windowId}:{})});
    return {ok:true,fallback:'tab'};
  }
}
async function closeToolOverlay(token,sender){
  const key='tool-overlay:'+token,receipt=(await chrome.storage.session.get(key))[key];
  if(!receipt)return {ok:true};
  if(sender.id!==chrome.runtime.id||sender.tab?.id!==receipt.tabId||sender.tab?.windowId!==receipt.windowId)throw Error('无权关闭此工具窗口');
  const index='tool-overlay-current:'+receipt.tabId+':'+receipt.tool;
  if((await chrome.storage.session.get(index))[index]===token)await chrome.storage.session.remove(index);
  await chrome.storage.session.remove(key);
  return {ok:true};
}
async function menus() {
  await chrome.contextMenus.removeAll();
  chrome.contextMenus.create({id:'translate',title:'精彩摘录 · 翻译',contexts:['selection']});
  chrome.contextMenus.create({id:'translate-page',title:'精彩摘录 · 开启网页双语翻译',contexts:['page']});
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
  await chrome.action.setBadgeBackgroundColor({color: pending.length ? '#555555' : '#1d1d1f'});
  await chrome.action.setBadgeText({text: pending.length ? String(pending.length) : '✓'});
  await chrome.action.setTitle({title: pending.length ? `${pending.length} 条待保存：${lastError}` : '精彩摘录 · 已写入本地文件'});
}
async function flush() {
  const {pending = []} = await chrome.storage.local.get('pending');
  while (pending.length) {
    try {
      const status = await native({action: 'status'});
      if(pending[0].type==='网页地址'&&(pending[0].title||pending[0].note||pending[0].author)&&!status.capabilities?.includes('bookmark-metadata-v1'))throw new Error('配套程序需要更新才能保存网址名称和备注。请运行“开始使用.cmd → 更新 / 修复”；这条记录已保留，更新后可补存。');
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
  if(info.menuItemId==='translate-page'){togglePageTranslation(tab).catch(pageTranslationFailure);return;}
  if(info.menuItemId==='translate'){
    const text=String(info.selectionText||'');if(!text.trim())return;
    (async()=>{const id=crypto.randomUUID(),key='translation:'+id;await chrome.storage.session.set({[key]:{text,createdAt:Date.now()}});try{await openToolOverlay('translate',id,tab);}catch(e){await chrome.storage.session.remove(key);throw e;}})().catch(e=>{chrome.action.setTitle({title:'翻译窗口未能打开：'+e.message}).catch(console.error);});return;
  }
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
  if(['link','page'].includes(info.menuItemId)){
    if(!Number.isInteger(tab?.windowId))return;
    const url=info.menuItemId==='link'?chosenLink:Collect.classify(info.pageUrl||tab.url).url;
    if(!url)return;
    // Open in the user gesture, then let the collection page confirm editable bookmark metadata.
    chrome.sidePanel.open({windowId:tab.windowId}).catch(console.error);
    exclusive(async()=>{await chrome.storage.session.set({[`collect-draft:${tab.windowId}`]:newCollectDraft(url,tab),[`app-view:${tab.windowId}`]:'collect'});}).catch(console.error);
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
  if(message?.action==='open-tool-overlay'){
    (async()=>{
      if(!['model','translate'].includes(message.tool))throw Error('未知的工具窗口');
      const trusted=topExtensionPage(sender,['app.html','library.html','translate.html','ocr-review.html'])
        ||await authorizedOverlaySender(sender,'translate')
        ||sender.id===chrome.runtime.id&&sender.url?.startsWith(chrome.runtime.getURL('ocr-review.html')+'?token=')&&Number.isInteger(sender.tab?.id);
      if(!trusted)throw Error('无权打开工具窗口');
      const inline=topExtensionPage(sender,['library.html','translate.html','ocr-review.html'])&&sender.tab?.url?.startsWith(chrome.runtime.getURL(''));
      return openToolOverlay(message.tool,message.tool==='translate'?String(message.translationId||''):'',sender.tab,inline);
    })().then(reply,error=>reply({ok:false,error:error.message}));return true;
  }
  if(message?.action==='close-tool-overlay'){
    closeToolOverlay(String(message.token||''),sender).then(reply,error=>reply({ok:false,error:error.message}));return true;
  }
  if(['page-translation-control','page-translation-status'].includes(message?.action))return handlePageTranslationControl(message,sender,reply);
  if(['page-translation-text','page-translation-stop','page-translation-options','page-translation-switch'].includes(message?.action))return handlePageTranslation(message,sender,reply);
  if(message.action==='free-translate' && sender.id===chrome.runtime.id && sender.url?.split(/[?#]/)[0]===chrome.runtime.getURL('translate.html')){
    (async()=>{if(!topExtensionPage(sender,['translate.html'])&&!(await authorizedOverlaySender(sender,'translate')))throw Error('翻译窗口未授权');if(message.route==='bilibili'){const host=await native({action:'status'});if(!host.capabilities?.includes('free-translation-native-v1'))throw Error('B站翻译需要更新本地程序：开始使用.cmd → 更新 / 修复，然后重新加载扩展');return native({...message,action:'ai-free-translate'});}return browserFreeTranslate(message);})().then(reply,e=>reply({ok:false,error:e.message,code:e.code||e.message}));return true;
  }
  if(['ai-settings-get','ai-translate'].includes(message.action)&&sender.id===chrome.runtime.id&&sender.url?.split(/[?#]/)[0]===chrome.runtime.getURL('translate.html')){
    (async()=>{if(!topExtensionPage(sender,['translate.html'])&&!(await authorizedOverlaySender(sender,'translate')))throw Error('翻译窗口未授权');const host=await native({action:'status'});if(!host.capabilities?.includes('ai-translation-v1'))throw Error('翻译需要更新本地程序，请运行“开始使用.cmd → 更新 / 修复”');return native(message);})().then(reply,e=>reply({ok:false,error:e.message,code:e.message}));return true;
  }
  const aiActions=['ai-model-select','ai-models-discover','ai-model-delete','ai-default-set','ai-model-import-preview','ai-model-import-apply','ai-test-draft','ai-test-vision','ai-settings-get','ai-settings-save','ai-ccswitch-list','ai-test','ai-prepare','ai-generate','ai-status','ai-recent','ai-read','ai-save'];
  if(aiActions.includes(message.action)&&sender.id===chrome.runtime.id&&['library.html','model-settings.html'].some(page=>sender.url?.split(/[?#]/)[0]===chrome.runtime.getURL(page))&&(topExtensionPage(sender,['library.html','model-settings.html'])||sender.url?.startsWith(chrome.runtime.getURL('model-settings.html')+'?overlay='))){
    (async()=>{if(!topExtensionPage(sender,['library.html','model-settings.html'])&&!(await authorizedOverlaySender(sender,'model')))throw Error('模型设置窗口未授权');const host=await native({action:'status'});if(!host.capabilities?.includes('ai-config-models-v2'))throw Error('模型管理需要更新本地程序，请运行“开始使用.cmd → 更新 / 修复”');if((message.action==='ai-test-vision'||message.action==='ai-test-draft'&&message.capability==='ocr')&&!host.capabilities?.includes('ai-vision-test-v1'))throw Error('AI_VISION_UPDATE_REQUIRED');return native(message);})().then(reply,e=>reply({ok:false,error:e.message,code:e.message}));return true;
  }
  const backupActions=['library-backup-create','library-backup-list','library-backup-open','library-restore-choose','library-restore-preview','library-restore-apply','library-restore-result'];
  const libraryActions=[...backupActions,'library-query','library-image','library-read','library-delete','library-update','library-taxonomy','library-duplicates','library-open','library-export-prepare','library-export-start','library-export-status','library-export-recent','library-export-open'];
  if(libraryActions.includes(message.action)&&sender.id===chrome.runtime.id&&sender.url?.split('?')[0]===chrome.runtime.getURL('library.html')){
    const run=async()=>{const host=await native({action:'status'});const capability=message.action==='library-delete'?'library-delete-v1':backupActions.includes(message.action)?'library-backup-v1':'library-v1';if(!host.capabilities?.includes(capability))throw Error('此功能需要更新本地程序，请运行“开始使用.cmd → 更新 / 修复”');if(['library-restore-apply','library-delete'].includes(message.action)){const {pending=[]}=await chrome.storage.local.get('pending');if(pending.length)throw Error('请先在侧栏重试并保存待处理记录，再恢复备份或删除资料。');}return native(message);};
    (['library-restore-apply','library-delete'].includes(message.action)?exclusive(run):run()).then(reply,e=>reply(Recovery.response(e)));return true;
  }
  const ocrReviewSender=sender.id===chrome.runtime.id&&sender.url?.startsWith(chrome.runtime.getURL('ocr-review.html')+'?');
  if(['capture-ocr-models','capture-ai-ocr'].includes(message.action)&&ocrReviewSender){
    (async()=>{if(message.action==='capture-ocr-models')return native({action:'ai-settings-get'});const host=await native({action:'status'});if(!host.capabilities?.includes('capture-ai-ocr-v1'))throw Error('请更新 / 修复本地程序以使用大模型截图识别。');if(message.confirmed!==true)throw Error('请确认使用所选模型提取文字');return native({action:'ai-capture-ocr',png:message.png,profileId:message.profileId,model:message.model,expectedRevision:message.expectedRevision,language:message.language,confirmed:true});})().then(reply,e=>reply(Recovery.response(e)));return true;
  }
  if(message.action==='video-status'&&sender.id===chrome.runtime.id&&sender.url===chrome.runtime.getURL('app.html')){
    native({action:'video-status'}).then(reply,e=>reply(Recovery.response(e)));return true;
  }
  if(['capture-save','capture-directory'].includes(message.action)&&sender.id===chrome.runtime.id&&sender.url===chrome.runtime.getURL('app.html')){
    (async()=>{const host=await native({action:'status'});if(!host.capabilities?.includes('capture-save-v1'))throw Error('请运行开始使用.cmd → 更新 / 修复，启用截图保存功能。');return native({action:message.action,png:message.png,name:message.name,directory:message.directory});})().then(reply,e=>reply(Recovery.response(e)));return true;
  }
  if(message.action==='capture-ocr'&&sender.id===chrome.runtime.id&&(['popup.html','app.html'].some(p=>sender.url===chrome.runtime.getURL(p))||ocrReviewSender)){
    (async()=>{const host=await native({action:'status'});if(!host.capabilities?.includes('capture-ocr-v1'))throw Error('请运行开始使用.cmd → 更新 / 修复，启用本地截图文字识别。');if(!['zh-Hans-CN','en-US','auto'].includes(message.language))throw Error('请选择识别语言');return native({action:'capture-ocr',png:message.png,language:message.language});})().then(reply,e=>reply(Recovery.response(e)));return true;
  }
  if(['collect-load','collect-edit','collect-save','collect-state','collect-retry'].includes(message.action)&&sender.id===chrome.runtime.id&&(['collect.html','popup.html','app.html'].some(p=>sender.url===chrome.runtime.getURL(p))||ocrReviewSender)){
    exclusive(()=>collectionRequest(message,sender.url===chrome.runtime.getURL('collect.html')?'collect-draft':'content-ocr-draft')).then(reply,error=>reply(Recovery.response(error)));return true;
  }
  if(message.action==='retry-pending' && sender.id===chrome.runtime.id && ['app.html','connection-window.html'].some(p=>sender.url?.split('?')[0]===chrome.runtime.getURL(p))){
    exclusive(async()=>{await flush();const {pending=[],lastError=''}=await chrome.storage.local.get(['pending','lastError']);return {ok:!pending.length,pendingCount:pending.length,error:Recovery.redact(lastError)};}).then(reply,e=>reply(Recovery.response(e)));return true;
  }
  if(message.action==='check-connection' && sender.id===chrome.runtime.id && ['app.html','collect.html','connection-window.html'].some(p=>sender.url?.split('?')[0]===chrome.runtime.getURL(p))){
    (async()=>{
      let timer;const deadline=new Promise((_,reject)=>{timer=setTimeout(()=>reject(Recovery.toError({code:'HOST_UNAVAILABLE',error:'检查超时，请重试'})),message.fullIntegrity===true?60000:12000);});
      try{
        const [diagnostics,status]=await Promise.allSettled([
          Promise.race([native({action:'diagnostics',extensionId:chrome.runtime.id,fullIntegrity:message.fullIntegrity===true}),deadline]),
          Promise.race([native({action:'status'}),deadline])
        ]);
        const host=status.status==='fulfilled'?status.value:null,report=diagnostics.status==='fulfilled'?diagnostics.value:null;
        if(!host&&!report)return {...Recovery.response(status.reason||diagnostics.reason),connected:false,checks:[{id:'browser',state:'fail',message:'未连接配套程序'}]};
        const checks=Array.isArray(report?.checks)?report.checks.filter(c=>c.id!=='browser'):[{id:'diagnostics',state:'pending',message:'配套程序尚不能完成检查，请更新'}];
        if(!host)checks.push({id:'save',state:'fail',message:'无法读取保存设置'});
        return {ok:true,connected:true,hostVersion:host?.version||'',diskExtensionVersion:host?.diskExtensionVersion||'',engineVersions:report?.engineVersions||{},extensionRoot:host?.extensionRoot||'',hostPath:host?.hostPath||'',journalPath:host?.journalPath||host?.path||'',storageFormat:host?.storageFormat||'',capabilities:host?.capabilities||[],checks:[{id:'browser',state:'pass',message:'配套程序已连接'},...checks]};
      }finally{clearTimeout(timer);}
    })().then(reply,e=>reply({...Recovery.response(e),connected:false}));return true;
  }
  if(message.action==='page-video-download' && sender.id===chrome.runtime.id && Number.isInteger(sender.tab?.windowId) && webpageUrl(sender.url)){
    const requestedPage=supportedVideoUrl(message.pageUrl);
    const originName=websiteName(sender.url),targetName=websiteName(requestedPage);
    const selectedPage=requestedPage&&originName===targetName?requestedPage:sender.url;
    const media=webpageUrl(message.mediaUrl),page=supportedVideoUrl(selectedPage)||(/\.(m3u8|mpd)(?:$|[?#])/i.test(media)?media:!media?webpageUrl(sender.url):'');
    if(!page && (!media || !/\.(mp4|webm|mov)(?:$|[?#])/i.test(media))){reply({ok:false,error:'此网页尚不能解析视频；请使用支持的网站详情页或直接粘贴视频链接。'});return;}
    // Keep opening the side panel inside the content-script click message gesture.
    const opened=chrome.sidePanel.open({windowId:sender.tab.windowId});
    (async()=>{
      if(!(await chrome.storage.local.get('hoverDownloadEnabled')).hoverDownloadEnabled)throw Error('视频悬浮下载按钮已关闭。');
      await opened;
      const windowId=sender.tab.windowId,url=page||media,id=crypto.randomUUID();
      await chrome.storage.session.set({[`video-url:${windowId}`]:url,[`video-source:${windowId}`]:{url,referer:sender.url},[`app-view:${windowId}`]:'video',[`hover-request:${windowId}`]:{id,url,time:Date.now()}});
      for(let attempt=0;attempt<40;attempt++){
        const key=`hover-receipt:${windowId}`,receipt=(await chrome.storage.session.get(key))[key];
        if(receipt?.id===id){if(!receipt.ok)throw Error(receipt.error);return {ok:true};}
        await new Promise(resolve=>setTimeout(resolve,250));
      }
      throw Error('侧栏未确认接收，请重新加载扩展并关闭后重开侧栏，再重试。');

    })().then(reply,e=>reply({ok:false,error:e.message}));return true;
  }

  if (sender.id === chrome.runtime.id && (sender.url === chrome.runtime.getURL('video.html') || sender.url?.startsWith(chrome.runtime.getURL('video.html?')) || sender.url===chrome.runtime.getURL('download.html')) && ['video-status','video-info','video-start','video-job','video-folder','video-set-folder','video-cookies','video-clear-cookies','video-open-recent','video-browser-cookies','video-gallery-start','video-gallery-image-info','video-gallery-capture','video-page-media','video-image-preview','video-jobs','video-resume','video-delete','video-pause','video-open-task','video-hf-info','video-file-start','video-file-probe','video-transfer-settings','download-page-links','hover-download-set','video-companion-stage-cover','video-companion-choose','video-companion-capture','video-companion-retry'].includes(message.action)) {
    (async()=>{
      if(message.action==='hover-download-set')return setHoverDownload(message.enabled===true,message.windowId);
      if(message.action==='download-page-links')return downloadPageLinks(message.windowId);
      const host=await native({action:'status'});
      if (!host.capabilities?.includes('video-api-2')) throw Error(`本地程序版本不匹配（${host.version || '未知旧版'}）。请运行本项目的“开始使用.cmd → 更新 / 修复”，然后重新加载扩展。`);
      if (!host.capabilities?.includes('video-multisite')) throw Error('请运行“开始使用.cmd → 更新 / 修复”更新多平台视频功能。');
      if(message.site==='toutiao' && !host.capabilities?.includes('video-toutiao')) throw Error('请运行“开始使用.cmd → 更新 / 修复”更新头条视频下载功能。');
      if (!host.capabilities?.includes('gallery')) throw Error('请运行“开始使用.cmd → 更新 / 修复”更新图集下载功能。');
      if(message.action.startsWith('video-companion-')){
        if(sender.url!==chrome.runtime.getURL('video.html')&&!sender.url?.startsWith(chrome.runtime.getURL('video.html?')))throw Error('配套资料只能从视频下载页操作。');
        if(!host.capabilities?.includes('video-companion-v1'))throw Error('本地程序需要更新 / 修复后才能使用视频配套图文。');
        if(!/^[a-f0-9]{32}$/.test(message.draftId||message.id||''))throw Error('配套资料编号无效。');
        if(message.action==='video-companion-capture')return native({action:message.action,draftId:message.draftId,png:message.png,sourceUrl:message.sourceUrl});
        if(message.action==='video-companion-choose')return native({action:message.action,draftId:message.draftId});
        if(message.action==='video-companion-stage-cover')return native({action:message.action,draftId:message.draftId,imageId:message.imageId});
        if(message.action==='video-companion-retry')return native({action:message.action,id:message.id});
      }
      if(message.site==='youtube' && !host.capabilities?.includes('video-youtube')) throw Error('请运行开始使用.cmd → 更新 / 修复 更新 YouTube 下载功能。');
      if(['video-jobs','video-resume','video-delete'].includes(message.action) && !host.capabilities?.includes('video-tasks')) throw Error('本机下载程序版本较旧。请运行项目中的“开始使用.cmd → 更新 / 修复”，然后在 chrome://extensions 重新加载扩展；只刷新扩展无法更新本地程序。');
      if(['video-start','video-resume','video-delete'].includes(message.action) && !host.capabilities?.includes('task-reuse')) throw Error('请运行开始使用.cmd → 更新 / 修复 更新任务复用和删除功能。');
      if(message.action==='video-open-task' && !host.capabilities?.includes('task-directory')) throw Error('请运行开始使用.cmd → 更新 / 修复 更新任务目录功能。');
      if(message.action==='video-gallery-start' && !host.capabilities?.includes('gallery-select')) throw Error('请更新本地程序以下载所选图片。');
      if(['video-hf-info','video-file-start','video-file-probe','video-transfer-settings'].includes(message.action) && !host.capabilities?.includes('parallel-files')) throw Error('请运行开始使用.cmd → 更新 / 修复 更新高速下载模块。');
      if(message.genericFile && !host.capabilities?.includes('generic-files'))throw Error('请运行开始使用.cmd → 更新 / 修复 更新普通文件下载功能。');
      if(message.action==='video-pause' && !host.capabilities?.includes('task-progress'))throw Error(`当前连接的本地程序未声明暂停能力（版本：${host.version || '未知'}；路径：${host.hostPath || '未提供'}）。请运行“开始使用.cmd → 更新 / 修复”，然后在 chrome://extensions 重新加载精彩摘录并重新打开侧边栏。更新扩展本身不会更新本地程序。`);
      if((message.action==='video-file-probe'||message.genericMedia||message.maxActive!==undefined) && !host.capabilities?.includes('download-suite'))throw Error('请更新本地程序以使用探测、队列或通用流媒体功能。');
      if((message.action==='video-gallery-image-info'||message.imageFormat&&message.imageFormat!=='original')&&!host.capabilities?.includes('gallery-image-options-v1'))throw Error('请运行开始使用.cmd → 更新 / 修复，启用图片信息和格式转换。');
      if(['video-image-preview','video-page-media'].includes(message.action)&&!host.capabilities?.includes('gallery-image-types-v1'))throw Error('请运行开始使用.cmd → 更新 / 修复，启用全部图片类型获取。');
      if(message.action==='video-gallery-capture'){
        if(!host.capabilities?.includes('gallery-capture-v1'))throw Error('请运行开始使用.cmd → 更新 / 修复，启用图集区域截图。');
        return native({action:'video-gallery-capture',draftId:message.draftId,png:message.png,sourceUrl:message.sourceUrl,sourceTitle:message.sourceTitle});
      }
      if(message.action==='video-image-preview'){
        const url=webpageUrl(message.url);if(!url||!/\.(jpe?g|gif|png|bmp|svg|webp|ico|tiff?|avif)$/i.test(new URL(url).pathname))throw Error('请填写支持的图片文件网址。');
        return native({action:'video-gallery-preview',url,title:new URL(url).pathname.split('/').pop(),images:[{url,width:0,height:0}]});
      }
      if(message.action==='video-page-media'){
        if(!host.capabilities?.includes('webpage-gallery-v1'))throw Error('请运行开始使用.cmd → 更新 / 修复，启用网页图片获取。');
        const mediaKind=['video','gallery'].includes(message.mediaKind)?message.mediaKind:'all';
        const captured=await collectPageMedia(message.windowId,message.url,mediaKind);
        if(!captured.ok)throw Error(captured.error);
        if(mediaKind==='video')return {...captured,images:[],kind:'page-media'};
        if(!captured.images.length)return {...captured,kind:'page-media'};
        const preview=await native({action:'video-gallery-preview',url:captured.url,title:captured.title,images:captured.images});
        return {...preview,videos:mediaKind==='gallery'?[]:captured.videos,captureUrl:captured.url};
      }
      let cookieText;
      if (message.action === 'video-browser-cookies') {
        if (!host.capabilities?.includes('browser-cookies')) throw Error('请运行“开始使用.cmd → 更新 / 修复”更新本地程序，然后重试获取登录态。');
        cookieText = await currentBiliCookies(message.windowId, videoSite(message.url));
      }
      if(message.transferMode==='extreme'&&!host.capabilities?.includes('range64'))throw Error('请更新本地程序以使用原生 64 路下载。');
      if(message.quality&&!host.capabilities?.includes('video-quality-v1'))throw Error('请在管理中心更新 / 修复本地程序，启用按画质档位下载。');
      if(message.mediaMode==='audio'&&!host.capabilities?.includes('audio-download'))throw Error('请更新本地程序以使用仅音频下载。');
      const result=await native({action:message.action,url:message.url,height:message.height,quality:message.quality,mediaMode:message.mediaMode,audioFormat:message.audioFormat,id:message.id,directory:message.directory,site:message.site,cookieText,draftId:message.draftId,confirmed:message.confirmed,selectedIndexes:message.selectedIndexes,index:message.index,imageFormat:message.imageFormat,title:message.title,statusFilter:message.statusFilter,offset:message.offset,transferMode:message.transferMode,genericFile:message.genericFile,filename:message.filename,checksum:message.checksum,genericMedia:message.genericMedia,referer:message.referer,maxActive:message.maxActive,autoClassify:message.autoClassify,adaptive:message.adaptive,companionDraftId:message.companionDraftId,companionTitle:message.companionTitle,companionText:message.companionText,companionImageIds:message.companionImageIds});
      if(['video-start','video-gallery-start','video-file-start','video-resume'].includes(message.action)) await chrome.storage.local.set({lastVideoJob:result.id,lastVideoSelection:{url:message.url,height:message.height,quality:message.quality,mediaMode:message.mediaMode,audioFormat:message.audioFormat}});
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

importScripts('page-translation-background.js');
