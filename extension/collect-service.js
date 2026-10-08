async function enqueueRecord(record){
  const {pending=[]}=await chrome.storage.local.get('pending');
  if(!pending.some(item=>item.id===record.id)){pending.push(record);await chrome.storage.local.set({pending});}
  await flush();
}
function newCollectDraft(text='',source={}){return {id:crypto.randomUUID(),revision:1,text,type:'内容',title:'',time:new Date().toISOString(),sourceUrl:source.url||'',sourceTitle:source.title||'',submissionState:'editing'};}
async function collectionRequest(message){
  if(!Number.isInteger(message.windowId)||message.windowId<0)throw Error('无法确定收集窗口，请重新打开侧栏');
  const key=`collect-draft:${message.windowId}`;
  let draft=(await chrome.storage.session.get(key))[key];
  if(message.action==='collect-load')return {ok:true,draft:draft||null};
  if(message.action==='collect-edit'){
    if(typeof message.text!=='string'||message.text.length>160000)throw Error('每次最多收集 16 万字，请分段保存');
    if(!['内容','评论','评阅','提示词','网页地址'].includes(message.type))throw Error('请选择有效的保存类型');
    if(message.id&&draft&&message.id!==draft.id)throw Error('草稿已被其他操作更新，请重新打开收集页');
    if(!draft||draft.submissionState!=='editing')draft=newCollectDraft();
    draft={...draft,text:message.text,type:message.type,title:String(message.title||'').trim(),revision:draft.revision+1};
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
    const choice=Collect.classify(draft.text);
    const record={id:draft.id,time:draft.time,type:choice.kind==='url'?'网页地址':draft.type,content:choice.kind==='url'?choice.url:draft.text};
    if(record.type==='提示词')record.title=draft.title;
    // Same immutable record ID is safe even if the original response was lost.
    await enqueueRecord(record);return saved();
  }
  if(message.action!=='collect-save')throw Error('不支持的收集操作');
  if(draft.submissionState!=='editing')return saved();
  const choice=Collect.classify(draft.text);if(choice.kind==='empty')throw Error('请先输入要保存的内容');
  if(draft.type==='提示词'&&(!draft.title||draft.title.length>120||/[\r\n]/.test(draft.title)))throw Error('提示词标题需要 1–120 字的单行文字');
  draft.submissionState='submitting';await chrome.storage.session.set({[key]:draft});
  const record={id:draft.id,time:draft.time,type:choice.kind==='url'?'网页地址':draft.type,content:choice.kind==='url'?choice.url:draft.text};
  if(record.type==='提示词')record.title=draft.title;
  await enqueueRecord(record);return saved();
}
