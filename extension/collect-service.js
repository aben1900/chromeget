async function enqueueRecord(record){
  const {pending=[]}=await chrome.storage.local.get('pending');
  if(!pending.some(item=>item.id===record.id)){pending.push(record);await chrome.storage.local.set({pending});}
  await flush();
}
function newCollectDraft(text='',source={}){return {id:crypto.randomUUID(),revision:1,text,type:'内容',title:'',bookmarkTitle:Collect.classify(text).url===Collect.classify(source.url).url&&source.url?String(source.title||'').slice(0,120):'',note:'',author:'',time:new Date().toISOString(),sourceUrl:source.url||'',sourceTitle:source.title||'',submissionState:'editing'};}
function collectRecord(draft,choice){
  const record={id:draft.id,time:draft.time,type:choice.kind==='url'?'网页地址':draft.type,content:choice.kind==='url'?choice.url:draft.text,sourceUrl:draft.sourceUrl,sourceTitle:draft.sourceTitle};
  if(record.type==='提示词')record.title=draft.title;
  if(choice.kind==='url'&&draft.bookmarkTitle!==undefined){record.title=draft.bookmarkTitle.trim();record.note=draft.note||'';record.author=(draft.author||'').trim();}
  return record;
}
async function collectHost(record){
  let host;try{host=await native({action:'status'});}catch(e){if(e.code!=='HOST_UNAVAILABLE')throw e;}
  if(host&&record.type==='网页地址'&&record.title!==undefined&&!host.capabilities?.includes('bookmark-metadata-v1'))throw Error('网址名称、备注和作者需要更新本地程序，请运行“开始使用.cmd → 更新 / 修复”后重试');
  return host;
}
async function collectionRequest(message,namespace='collect-draft'){
  if(!Number.isInteger(message.windowId)||message.windowId<0)throw Error('无法确定收集窗口，请重新打开侧栏');
  const key=`${namespace}:${message.windowId}`;
  let draft=(await chrome.storage.session.get(key))[key];
  if(message.action==='collect-load')return {ok:true,draft:draft||null};
  if(message.action==='collect-edit'){
    if(typeof message.text!=='string'||message.text.length>160000)throw Error('每次最多收集 16 万字，请分段保存');
    if(!['内容','评论','评阅','提示词','网页地址'].includes(message.type))throw Error('请选择有效的保存类型');
    if(message.id&&draft&&message.id!==draft.id)throw Error('草稿已被其他操作更新，请重新打开收集页');
    if(!draft||draft.submissionState!=='editing')draft=newCollectDraft();
    draft={...draft,text:message.text,type:message.type,title:String(message.title||'').trim(),explicitType:message.explicitType===true,revision:draft.revision+1};
    for(const field of ['bookmarkTitle','note','author'])if(message[field]!==undefined){if(typeof message[field]!=='string')throw Error('网址信息必须是文字');draft[field]=message[field];}
    if(message.sourceUrl!==undefined){draft.sourceUrl=Collect.classify(message.sourceUrl).url||'';draft.sourceTitle=String(message.sourceTitle||'').slice(0,500);}
    await chrome.storage.session.set({[key]:draft});return {ok:true,draft};
  }
  if(!draft||draft.id!==message.id||(message.revision!==undefined&&draft.revision!==message.revision))throw Error('草稿已变化，请重新确认当前内容');
  const saved=async()=>{
    const {pending=[],savedCollect={},lastError=''}=await chrome.storage.local.get(['pending','savedCollect','lastError']);
    const state=draft.submissionState==='saved'||savedCollect[draft.id]?'saved':pending.some(r=>r.id===draft.id)?'pending':draft.submissionState==='editing'?'editing':'unknown';
    if(state==='saved'&&draft.submissionState!=='saved'){draft.submissionState='saved';await chrome.storage.session.set({[key]:draft});}
    return {ok:true,id:draft.id,state,error:state==='pending'?Recovery.redact(lastError):''};
  };
  if(message.action==='collect-state')return saved();
  if(message.action==='collect-retry'){
    const state=await saved();if(state.state==='saved'||state.state==='editing')return state;
    const choice=draft.explicitType&&draft.type!=='网页地址'?{kind:'text',text:draft.text}:Collect.classify(draft.text);
    const record=collectRecord(draft,choice);
    await collectHost(record);
    // Same immutable record ID is safe even if the original response was lost.
    await enqueueRecord(record);return saved();
  }
  if(message.action!=='collect-save')throw Error('不支持的收集操作');
  if(draft.submissionState!=='editing')return saved();
  const choice=draft.explicitType&&draft.type!=='网页地址'?{kind:draft.text.trim()?'text':'empty',text:draft.text}:Collect.classify(draft.text);if(choice.kind==='empty')throw Error('请先输入要保存的内容');
  if(draft.explicitType&&draft.type==='网页地址'&&choice.kind!=='url')throw Error('保存为链接时需要一条完整网址');
  if(choice.kind==='url'){
    if(typeof draft.bookmarkTitle!=='string'||!draft.bookmarkTitle.trim()||draft.bookmarkTitle.trim().length>120||/[\r\n]/.test(draft.bookmarkTitle))throw Error('网址名称需要 1–120 字的单行文字');
    if((draft.note||'').length>2000)throw Error('网址备注最多 2000 字');
    if((draft.author||'').trim().length>120)throw Error('作者最多 120 字');
  }else if(draft.type==='提示词'&&(!draft.title||draft.title.length>120||/[\r\n]/.test(draft.title)))throw Error('提示词标题需要 1–120 字的单行文字');
  const record=collectRecord(draft,choice),host=await collectHost(record);
  if(message.allowDuplicate!==true&&host?.capabilities?.includes('library-v1')){const check=await native({action:'library-duplicates',content:record.content,type:record.type});if(check.matches?.length)return {ok:true,state:'duplicate',matches:check.matches};}
  draft.submissionState='submitting';await chrome.storage.session.set({[key]:draft});
  await enqueueRecord(record);return saved();
}
