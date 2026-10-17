(() => {
  const el=id=>document.getElementById(id);
  let windowId,draft=null,edits=Promise.resolve(),editError=null,busy=false,saved=false,sequence=0,epoch=0,replacement=null,savePath='';
  async function send(action,extra={}){
    let timer;try{const r=await Promise.race([chrome.runtime.sendMessage({action,windowId,...extra}),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error(action==='collect-choose-save-directory'?'选择目录超时，请重试':'提交结果尚未确认，请检查保存状态')),action==='collect-choose-save-directory'?300000:20000);})]);if(!r?.ok)throw (typeof Recovery!=='undefined'?Recovery.toError(r):Error(r?.error||'操作未完成'));return r;}finally{clearTimeout(timer);}
  }
  function render(){
    const c=Collect.classify(el('collectInput').value),isUrl=c.kind==='url';
    el('previewCard').hidden=c.kind==='empty';el('collectPreview').textContent=c.url||c.text;
    el('previewLabel').textContent=isUrl?'网页地址':c.kind==='multi'?'多个网址':'文字内容';
    el('inputKind').textContent=c.kind==='empty'?'':isUrl?'已识别网址，可收藏地址或下载内容':c.kind==='multi'?'检测到多个网址，批量下载需要再次确认':'文字将完整保存到本地';
    el('textOptions').hidden=isUrl;el('titleField').hidden=el('collectType').value!=='提示词';el('bookmarkFields').hidden=!isUrl;
    el('downloadCollect').hidden=!isUrl;el('batchCollect').hidden=c.kind!=='multi';
    el('saveCollect').textContent=saved?'已保存':busy?'正在保存…':isUrl?'保存为网址':'确认保存';
    for(const id of ['collectInput','collectType','collectTitle','bookmarkTitle','bookmarkNote','bookmarkAuthor','useCurrentPage'])el(id).disabled=busy||!Number.isInteger(windowId);
    el('saveCollect').disabled=busy||!Number.isInteger(windowId)||c.kind==='empty';
    el('downloadCollect').disabled=busy;el('chooseSaveFile').disabled=busy||!Number.isInteger(windowId);el('collectHint').textContent='保存文件：'+(savePath||'正在读取…');el('collectHint').title=savePath;
  }
  function persist(source){
    el('duplicatePanel').hidden=true;saved=false;const token=++sequence,editEpoch=epoch,snapshot={text:el('collectInput').value,type:el('collectType').value,title:el('collectTitle').value,bookmarkTitle:el('bookmarkTitle').value,note:el('bookmarkNote').value,author:el('bookmarkAuthor').value,...(source||{})};
    el('collectStatus').textContent='';el('collectError').textContent='';el('checkCollect').hidden=true;render();
    edits=edits.then(async()=>{if(editEpoch!==epoch)return;try{const r=await send('collect-edit',{...snapshot,id:draft?.id});if(editEpoch===epoch){draft=r.draft;editError=null;}}catch(e){if(editEpoch===epoch){editError=e;if(token===sequence)if(typeof Recovery!=='undefined')Recovery.setError(el('collectError'),e);else el('collectError').textContent=e.message;}}});return edits;
  }
  function load(d){epoch++;sequence++;editError=null;draft=d;el('collectError').textContent='';el('collectStatus').textContent='';el('collectInput').value=d?.text||'';el('collectType').value=d?.type==='网页地址'?'内容':d?.type||'内容';el('collectTitle').value=d?.title||'';el('bookmarkTitle').value=d?.bookmarkTitle||'';el('bookmarkNote').value=d?.note||'';el('bookmarkAuthor').value=d?.author||'';saved=d?.submissionState==='saved';el('checkCollect').hidden=!d||d.submissionState==='editing'||saved;render();}
  function finish(){busy=false;if(replacement){const d=replacement;replacement=null;load(d);}render();}
  el('collectInput').addEventListener('input',()=>{if(el('collectType').value==='提示词')el('collectTitle').value=summarizePromptTitle(el('collectInput').value);persist();});
  el('collectType').addEventListener('change',()=>{if(el('collectType').value==='提示词'&&!el('collectTitle').value)el('collectTitle').value=summarizePromptTitle(el('collectInput').value);persist();});
  el('collectTitle').addEventListener('input',()=>persist());
  for(const id of ['bookmarkTitle','bookmarkNote','bookmarkAuthor'])el(id).addEventListener('input',()=>persist());
  function displayState(r){if(r.state==='duplicate'){el('duplicatePanel').hidden=false;el('existingRecord').href=chrome.runtime.getURL('library.html')+'?id='+encodeURIComponent(r.matches[0].id);el('collectStatus').textContent='尚未再次保存，请选择查看已有资料或仍然保存。';return;}el('duplicatePanel').hidden=true;saved=r.state==='saved';el('collectStatus').textContent=saved?'已保存到本地，可在“内容摘录”查看。':r.state==='pending'?'内容已保留在待保存队列，修复连接后可重试。':'保存结果尚未确认，请检查状态。';el('collectError').textContent=r.error||'';el('checkCollect').hidden=saved;el('checkCollect').textContent=r.state==='pending'?'重试待保存记录':'检查保存状态';}
  async function save(allowDuplicate=false){
    if(busy||saved)return;busy=true;render();
    try{await edits;if(editError)throw editError;if(!draft){await persist();if(editError)throw editError;}const r=await send('collect-save',{id:draft.id,revision:draft.revision,allowDuplicate});displayState(r);}
    catch(e){if(typeof Recovery!=='undefined')Recovery.setError(el('collectError'),e);else el('collectError').textContent=e.message;el('checkCollect').hidden=!draft;}finally{finish();}
  }
  el('saveCollect').addEventListener('click',()=>save(false));
  el('chooseSaveFile').addEventListener('click',async()=>{if(busy)return;busy=true;render();try{await edits;if(editError)throw editError;const r=await send('collect-choose-save-directory');if(!r.cancelled){savePath=r.journalPath;el('collectStatus').textContent='已设置保存文件：'+savePath;el('collectError').textContent='';}}catch(e){if(typeof Recovery!=='undefined')Recovery.setError(el('collectError'),e);else el('collectError').textContent=e.message;}finally{busy=false;render();}});
  el('saveDuplicate').addEventListener('click',()=>save(true));
  el('checkCollect').addEventListener('click',async()=>{if(busy||!draft)return;busy=true;el('checkCollect').disabled=true;render();try{await edits;let r=await send('collect-state',{id:draft.id});if(r.state==='pending'||r.state==='unknown')r=await send('collect-retry',{id:draft.id});displayState(r);}catch(e){if(typeof Recovery!=='undefined')Recovery.setError(el('collectError'),e);else el('collectError').textContent=e.message;}finally{el('checkCollect').disabled=false;finish();}});
  async function route(batch=false){
    try{await edits;const c=Collect.classify(el('collectInput').value);if(batch){await chrome.storage.session.set({[`download-batch:${windowId}`]:c.text.split(/\r?\n/).map(s=>Collect.classify(s).url).filter(Boolean),[`app-view:${windowId}`]:'download'});return;}
      if(c.kind!=='url')return;const video=supportedVideoUrl(c.url)||/\.(m3u8|mpd)(?:$|[?#])/i.test(c.url);await chrome.storage.session.set(video?{[`video-url:${windowId}`]:c.url,[`app-view:${windowId}`]:'video'}:{[`download-link:${windowId}`]:{url:c.url,time:Date.now()},[`app-view:${windowId}`]:'download'});
    }catch(e){if(typeof Recovery!=='undefined')Recovery.setError(el('collectError'),e);else el('collectError').textContent=e.message;}
  }
  el('downloadCollect').addEventListener('click',()=>route());el('batchCollect').addEventListener('click',()=>route(true));
  el('useCurrentPage').addEventListener('click',async()=>{try{const [tab]=await chrome.tabs.query({active:true,windowId});if(!Collect.classify(tab?.url).url)throw Error('当前页面不能收集，请切换到普通网页');el('collectInput').value=tab.url;el('bookmarkTitle').value=String(tab.title||'').slice(0,120);await persist({sourceUrl:tab.url,sourceTitle:tab.title||''});}catch(e){if(typeof Recovery!=='undefined')Recovery.setError(el('collectError'),e);else el('collectError').textContent=e.message;}});
  chrome.windows.getCurrent().then(async w=>{windowId=w.id;const token=sequence;const [loaded,location]=await Promise.allSettled([send('collect-load'),send('collect-save-location')]);if(loaded.status==='fulfilled'&&sequence===token)load(loaded.value.draft);if(location.status==='fulfilled')savePath=location.value.journalPath||'';else savePath='暂不可读取';if(loaded.status==='rejected'||location.status==='rejected')el('collectError').textContent=(loaded.status==='rejected'?loaded.reason:location.reason).message;chrome.storage.onChanged.addListener((changes,area)=>{const d=changes[`collect-draft:${windowId}`]?.newValue;if(area==='session'&&d?.sourceUrl&&d.id!==draft?.id){if(busy)replacement=d;else load(d);}});render();}).catch(e=>{if(typeof Recovery!=='undefined')Recovery.setError(el('collectError'),e);else el('collectError').textContent=e.message;});
  render();
})();
