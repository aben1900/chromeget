(() => {
 const $=id=>document.getElementById(id);
 const {send,explain,modelChoice,catalogGroups,catalogGroup,freePresets,presetFor}=window.LibraryAiApi;
 let profiles={},defaultId=null,selectionRevision='',connected=false,busy=false,dialogSession=0,dialogEditing=null,dialogBusy=false,preview=null,importSession=0,signature='';
 let view={query:'',tag:'',status:'',sort:'name-asc',defaultFirst:true,collapsedTags:[]};
 const {buildConfigView,modelsOf}=window.LibraryAiView;
 let draftModels=[],testReceipt=null,editorEpoch=0,testReceipts=new Map(),testResults=new Map(),batch=null;
 const collator=new Intl.Collator('zh-CN',{numeric:true,sensitivity:'base'});
 const dialog=$('aiModelDialog'),importDialog=$('aiImportDialog');
 function selected(){const p=profiles[defaultId];if(!connected||!p||!p.hasKey)throw Error('DEFAULT_MODEL_REQUIRED');return {...p};}
 function setStatus(text){$('aiSettingsStatus').textContent=text;}
 function controls(){$('aiDefaultModel').disabled=busy||!connected||!document.querySelectorAll('#aiDefaultModel option[data-passed]').length;for(const el of $('aiModelList').querySelectorAll('select'))el.disabled=busy;for(const id of ['aiAddModel','aiImportModels'])$(id).disabled=busy||!connected;$('aiReconnect').disabled=busy;for(const b of $('aiModelList').querySelectorAll('button'))b.disabled=busy;}
 function update(r){profiles=r.profiles||{};defaultId=r.defaultProfileId||null;selectionRevision=r.selectionRevision;connected=true;render();const next=JSON.stringify([defaultId,selectionRevision,Object.values(profiles).map(p=>[p.profileId,p.revision])]);if(next!==signature){signature=next;chrome.storage.local.set({aiSettingsUpdated:Date.now()}).catch(()=>{});window.dispatchEvent(new Event('ai-profile-changed'));}}
 function button(text,fn){const b=document.createElement('button');b.type='button';b.textContent=text;b.addEventListener('click',fn);return b;}
 function statusOf(p){return !p.hasKey?'unconfigured':p.lastTest?.revision===p.revision?(p.lastTest.ok?'passed':'failed'):'untested';}
 function syncView(){
  $('aiModelSearch').value=view.query;$('aiStatusFilter').value=view.status;$('aiModelSort').value=view.sort;$('aiDefaultFirst').checked=view.defaultFirst;
  const tags=[...new Set(Object.values(profiles).flatMap(p=>p.tags||[]))].sort(collator.compare);
  if(view.tag&&!tags.includes(view.tag))tags.push(view.tag);
  $('aiTagFilter').replaceChildren(new Option('全部标签',''),...tags.map(t=>new Option(t,t)));$('aiTagFilter').value=view.tag;
 }
 function saveView(){chrome.storage.local.set({aiModelView:view}).catch(()=>setStatus('筛选已生效，但未能记住本次选择。'));}


 function modelStatus(p,m){return !p.hasKey?'unconfigured':m.lastTest?.revision===p.revision?(m.lastTest.ok?'passed':'failed'):'untested'}
 const stateLabels={passed:'✓ 测试成功',failed:'✕ 测试失败',untested:'○ 未测试',unconfigured:'— 未配置密钥'};
 function renderDefault(){
  const select=$('aiDefaultModel');select.replaceChildren();let selected=false;
  for(const p of Object.values(profiles).sort((a,b)=>collator.compare(a.label,b.label))){const models=modelsOf(p).filter(m=>modelStatus(p,m)==='passed');if(!models.length)continue;const group=document.createElement('optgroup');group.label=p.label;
   for(const m of models.sort((a,b)=>collator.compare(a.label,b.label))){const o=new Option(p.label+' / '+modelChoice(m),JSON.stringify([p.profileId,m.id]));o.dataset.passed='true';if(defaultId===p.profileId&&p.model===m.id){o.selected=true;selected=true;}group.append(o)}select.append(group);
  }
  if(!selected){const p=profiles[defaultId],o=new Option(p?'当前默认：'+p.label+' / '+modelChoice({id:p.model,label:p.model})+'（待测试）':'选择已测试成功的模型','');o.disabled=true;o.selected=true;select.prepend(o)}
 }
 $('aiDefaultModel').onchange=()=>{const [profileId,model]=JSON.parse($('aiDefaultModel').value);const p=profiles[profileId];run(async()=>{try{update(await send('ai-default-set',{profileId,model,expectedRevision:p.revision,expectedSelectionRevision:selectionRevision}));setStatus('默认模型已更新，智能功能将使用 '+p.label+' / '+model+'。')}catch(e){render();throw e;}})};
 function render(){renderDefault();
  const defaultProfile=profiles[defaultId];$('aiDefaultLabel').textContent=defaultProfile?'★ 默认：'+defaultProfile.label+' / '+defaultProfile.model:'尚未设置默认模型 · 请从上方下拉选择';$('aiUsageStatus').textContent=defaultProfile?'当前摘要模型：'+defaultProfile.label+' · '+defaultProfile.model:'还没有默认模型。请先连接服务，测试并保存一个模型，再在上方选择。';$('aiDefaultLabel').classList.toggle('has-default',!!defaultProfile);syncView();
  const list=$('aiModelList');list.replaceChildren();const result=buildConfigView(profiles,defaultId,view);$('aiModelCount').textContent='显示 '+result.uniqueCount+' / '+Object.keys(profiles).length+' 份配置';
  for(const group of result.groups){
   const section=document.createElement('details');section.className='config-group';section.open=!!view.query||!(view.collapsedTags||[]).includes(group.tag);const summary=document.createElement('summary');summary.textContent=(group.tag||'未分类')+' · '+group.rows.length+' 份配置';section.append(summary);
   section.addEventListener('toggle',()=>{if(view.query||!section.isConnected)return;const collapsed=new Set(view.collapsedTags||[]);section.open?collapsed.delete(group.tag):collapsed.add(group.tag);view.collapsedTags=[...collapsed];saveView()});
   for(const p of group.rows){
    const row=document.createElement('div');row.className='config-row'+(p.profileId===defaultId?' is-default':'');row.dataset.modelId=p.profileId;
    const info=document.createElement('div');info.className='config-name';const name=document.createElement('strong');name.className='model-name';name.textContent=p.label;name.title=p.label;info.append(name);if(p.profileId===defaultId){const badge=document.createElement('span');badge.className='model-badge';badge.textContent='★ 默认';info.append(badge)}
    const selection=document.createElement('div');selection.className='config-selection';const select=document.createElement('select');select.className='config-model-select';select.setAttribute('aria-label',p.label+'：当前启用模型');
    for(const m of [...modelsOf(p)].sort((a,b)=>collator.compare(a.label,b.label)||collator.compare(a.id,b.id))){const title=modelChoice(m)+' — '+stateLabels[modelStatus(p,m)];select.append(new Option(title,m.id));}select.value=p.model;
    select.addEventListener('change',()=>{const model=select.value;run(async()=>{try{update(await send('ai-model-select',{profileId:p.profileId,model,expectedRevision:p.revision}));setStatus(p.label+' 当前模型已切换为 '+model+'。')}catch(e){render();throw e;}})});selection.append(select);
    if(p.matchOtherModel){const hint=document.createElement('small');hint.textContent='匹配其他模型';selection.append(hint)}
    const status=document.createElement('span');status.className='model-status '+statusOf(p);status.textContent=stateLabels[statusOf(p)];if(p.lastTest&&!p.lastTest.ok)status.title=explain(Error(p.lastTest.code));
    const actions=document.createElement('div');actions.className='config-actions';actions.append(button('测试',()=>run(async()=>{setStatus('正在测试 '+p.label+' / '+p.model+'…');try{await send('ai-test',{profileId:p.profileId,model:p.model,expectedRevision:p.revision,confirmed:true});setStatus('连接测试成功。')}finally{update(await send('ai-settings-get'))}})),button('编辑',()=>openEditor(p)));
    const more=document.createElement('details');more.className='config-more';const menu=document.createElement('summary');menu.textContent='更多';const options=document.createElement('div');options.append(button(p.profileId===defaultId?'已设为默认':'设为默认',()=>run(async()=>{update(await send('ai-default-set',{profileId:p.profileId,expectedSelectionRevision:selectionRevision}));setStatus('默认配置已设置，智能摘要将使用其当前模型。')})),button('删除配置',()=>{more.open=false;confirmDelete(row,p)}));more.append(menu,options);actions.append(more);row.append(info,selection,status,actions);section.append(row);
   }list.append(section);
  }
  if(!list.children.length){const empty=document.createElement('p');empty.className='model-empty';empty.textContent=Object.keys(profiles).length?'没有匹配的配置，请修改搜索条件或清除筛选。':'还没有配置，点击“添加配置”或“导入模型”。';list.append(empty)}controls();
 }
 for(const id of ['aiModelSearch','aiTagFilter','aiStatusFilter','aiModelSort','aiDefaultFirst'])$(id).addEventListener(id==='aiModelSearch'?'input':'change',()=>{view={...view,query:$('aiModelSearch').value,tag:$('aiTagFilter').value,status:$('aiStatusFilter').value,sort:$('aiModelSort').value,defaultFirst:$('aiDefaultFirst').checked};saveView();render()});
 $('aiClearFilters').onclick=()=>{view.query='';view.tag='';view.status='';saveView();render()};
 function confirmDelete(row,p){if(row.querySelector('.model-delete-confirm'))return;const area=document.createElement('div');area.className='model-delete-confirm';const text=document.createElement('span');text.textContent=p.profileId===defaultId?'删除后需要重新设置默认模型。':'删除此模型？';area.append(text,button('确认删除',()=>run(async()=>{update(await send('ai-model-delete',{profileId:p.profileId,expectedRevision:p.revision}));setStatus('模型已删除。')})),button('取消',()=>area.remove()));row.append(area);}
 function report(e){setStatus(explain(e));if(e.message==='EXTENSION_RELOAD_REQUIRED'){connected=false;$('aiReloadExtension').hidden=$('aiReloadHint').hidden=false;$('aiConnection').textContent='扩展后台需要重新加载';}controls();}
 async function run(fn){if(busy)return;busy=true;controls();try{await fn()}catch(e){report(e)}finally{busy=false;controls();}}
 async function connect(){
  const local=await chrome.storage.local.get(['aiSelection','aiModelView']);if(local.aiModelView){const v=local.aiModelView;view={query:typeof v.query==='string'?v.query.slice(0,200):'',tag:typeof v.tag==='string'?v.tag:'',status:['passed','failed','untested','unconfigured'].includes(v.status)?v.status:'',sort:['name-asc','name-desc','tags','status'].includes(v.sort)?v.sort:'name-asc',defaultFirst:v.defaultFirst!==false,collapsedTags:Array.isArray(v.collapsedTags)?v.collapsedTags.filter(t=>typeof t==='string'):[]};}const r=await send('ai-settings-get',{legacySelection:local.aiSelection});update(r);$('aiConnection').textContent='已连接本地程序';$('aiReloadExtension').hidden=$('aiReloadHint').hidden=true;setStatus(r.migrationWarnings?.filter(Boolean).length?'配置已刷新。部分旧配置因密钥无法解密或模型数量限制保持独立，可在编辑中检查。':'配置已刷新。');
  if(!r.importsCompleted){try{const p=await send('ai-model-import-preview',{source:'workbuddy'});const ids=p.items.filter(v=>v.change==='add'&&!v.conflict).map(v=>v.candidateId);if(p.items.length){update(await send('ai-model-import-apply',{previewId:p.previewId,candidateIds:ids}));setStatus('已自动导入 '+ids.length+' 个模型。请选择默认模型；导入不代表连接测试成功。')}else setStatus('没有找到 SMEC 模型，可手动添加或从 CC-Switch 导入。')}catch(e){setStatus(explain(e)+' 手动添加模型仍可使用。')}}
 }

 function renderEditorModels(current=$('aiModel').value){
  draftModels.sort((a,b)=>collator.compare(a.label,b.label)||collator.compare(a.id,b.id));const list=$('aiModelsEditor');list.replaceChildren();$('aiModel').replaceChildren(...draftModels.map(m=>new Option(modelChoice(m),m.id)));if(draftModels.some(m=>m.id===current))$('aiModel').value=current;
  for(const m of draftModels){const row=document.createElement('div');row.className='catalog-entry';row.dataset.entry=m.id;const id=document.createElement('code');id.textContent=m.id;const tag=document.createElement('small');tag.className='model-capability';tag.textContent=catalogGroups[catalogGroup(m.id)];tag.title='按型号规则推断，仅供选型参考，不是实测排名';id.append(tag);const name=document.createElement('input');name.value=m.label;name.maxLength=200;name.setAttribute('aria-label',m.id+'：模型显示名称');name.addEventListener('input',()=>{m.label=name.value||m.id;const option=[...$('aiModel').options].find(o=>o.value===m.id);if(option)option.textContent=modelChoice(m)});row.append(id,name,button('移除',()=>{if($('aiModel').value===m.id){$('aiDialogStatus').textContent='请先选择其他当前模型，再移除此模型。';return}draftModels=draftModels.filter(x=>x.id!==m.id);testReceipt=null;editorEpoch++;renderEditorModels()}));const result=testResults.get(m.id);const status=document.createElement('span');status.className='catalog-test-status '+(result?(result.ok?'passed':'failed'):'');status.textContent=result?(result.ok?'✓ 成功':(result.unconfirmed?'○ 未完成 · ':'✕ ')+explain(Error(result.code))+(result.unconfirmed?'；未记录新结果，保留已保存测试状态。':'')):'未测试';row.append(status);list.append(row)}
 }
 $('aiAddEntry').onclick=()=>{const id=$('aiNewModelId').value.trim();if(!id||/[\x00-\x1f]/.test(id)||id.length>200){$('aiDialogStatus').textContent='请填写有效模型 ID。';return}if(draftModels.some(m=>m.id===id)){$('aiDialogStatus').textContent='该模型已在清单中。';return}if(draftModels.length>=200){$('aiDialogStatus').textContent='每份配置最多 200 个模型。';return}draftModels.push({id,label:$('aiNewModelLabel').value.trim()||id});renderEditorModels();$('aiNewModelId').value=$('aiNewModelLabel').value='';testReceipt=null;editorEpoch++;};
 let discoveredModels=[],discoveredSelection=new Map();

 function renderDiscovered(){
  const query=$('aiCatalogSearch').value.trim().toLowerCase(),scope=$('aiCatalogScope').value,sort=$('aiCatalogSort').value;
  const rank=sort==='strength'?{strong:0,balanced:1,fast:2,unknown:3,special:4}:sort==='speed'?{fast:0,balanced:1,strong:2,unknown:3,special:4}:{balanced:0,fast:1,strong:2,unknown:3,special:4};
  const list=discoveredModels.map(m=>({...m,group:catalogGroup(m.id)})).filter(m=>(scope==='all'||(scope==='text'?!['special','unknown'].includes(m.group):m.group===scope))&&(`${m.id} ${m.label}`.toLowerCase().includes(query)));
  list.sort((a,b)=>(sort==='name'?0:rank[a.group]-rank[b.group])||Number(/-\d{4}-\d{2}-\d{2}$/.test(a.id))-Number(/-\d{4}-\d{2}-\d{2}$/.test(b.id))||a.id.localeCompare(b.id,undefined,{numeric:true}));
  $('aiDiscoveredList').replaceChildren();let previous='';
  for(const m of list){
   if(sort!=='name'&&m.group!==previous){const h=document.createElement('h4');h.textContent=catalogGroups[m.group];$('aiDiscoveredList').append(h);previous=m.group;}
   const label=document.createElement('label'),check=document.createElement('input'),text=document.createElement('span'),hint=document.createElement('small');
   check.type='checkbox';check.value=m.id;check.dataset.label=m.label;check.setAttribute('aria-label','添加 '+m.id);check.checked=discoveredSelection.has(m.id);check.disabled=draftModels.some(x=>x.id===m.id);check.onchange=()=>{if(check.checked)discoveredSelection.set(m.id,m);else discoveredSelection.delete(m.id);updateCatalogCount(list.length)};
   text.textContent=m.id;hint.textContent=(check.disabled?'已添加 · ':'')+catalogGroups[m.group]+(/-\d{4}-\d{2}-\d{2}$/.test(m.id)?' · 日期快照':'');text.append(hint);label.append(check,text);$('aiDiscoveredList').append(label);
  }
  updateCatalogCount(list.length);
 }
 function updateCatalogCount(count){$('aiCatalogCount').textContent=`显示 ${count} / ${discoveredModels.length} 个 · 已选 ${discoveredSelection.size} 个（含筛选隐藏项）`;}
 for(const id of ['aiCatalogSearch','aiCatalogScope','aiCatalogSort'])$(id).addEventListener(id==='aiCatalogSearch'?'input':'change',renderDiscovered);
 $('aiCatalogClear').onclick=()=>{discoveredSelection.clear();renderDiscovered()};

 $('aiDiscoverModels').onclick=async()=>{if(dialogBusy)return;const token=dialogSession,epoch=editorEpoch;dialogBusy=true;editorControls();$('aiDialogStatus').textContent='正在获取模型清单…';try{const r=await send('ai-models-discover',{draft:draft()});if(token!==dialogSession||epoch!==editorEpoch||!dialog.open)return;discoveredModels=r.models;discoveredSelection.clear();$('aiCatalogSearch').value='';$('aiCatalogScope').value=r.models.some(m=>!['unknown','special'].includes(catalogGroup(m.id)))?'text':'all';$('aiCatalogSort').value='summary';renderDiscovered();$('aiDiscovered').hidden=!r.models.length;$('aiDialogStatus').textContent=r.models.length?'选择需要加入的模型，不会改变当前模型。':'接口没有返回模型，可手动添加模型 ID。';}catch(e){if(token===dialogSession)$('aiDialogStatus').textContent=(String(e.code||e.message).includes('NETWORK_TIMEOUT')?'获取模型清单超时。请检查 Clash 是否运行、系统代理及接口地址；超时不代表 API Key 错误。':explain(e))+' 可手动添加模型 ID。';}finally{if(token===dialogSession){dialogBusy=false;editorControls();for(const check of $('aiDiscoveredList').querySelectorAll('input'))check.disabled=draftModels.some(m=>m.id===check.value);}}};
 $('aiApplyDiscovered').onclick=()=>{const add=[...discoveredSelection.values()].filter(c=>!draftModels.some(m=>m.id===c.id));if(draftModels.length+add.length>200){$('aiDialogStatus').textContent='每份配置最多 200 个模型。';return}for(const c of add)draftModels.push({id:c.id,label:c.label});renderEditorModels();$('aiDiscovered').hidden=true;testReceipt=null;editorEpoch++;};
 function protocolControls(){$('aiAuthLabel').hidden=$('aiProtocol').value!=='anthropic';if($('aiAuthLabel').hidden)$('aiAuth').value='bearer';}
 function openEditor(p){testReceipts=new Map();testResults=new Map(modelsOf(p||{}).filter(m=>m.lastTest?.revision===p?.revision).map(m=>[m.id,m.lastTest]));batch=null;$('aiBatchStatus').textContent='';dialogSession++;editorEpoch++;testReceipt=null;draftModels=modelsOf(p||{}).filter(m=>m.id).map(m=>({id:m.id,label:m.label}));dialogEditing=p?{...p}:null;dialogBusy=false;$('aiModelForm').reset();$('aiDialogTitle').textContent=p?'编辑配置':'添加配置';$('aiLabel').value=p?.label||'';$('aiTags').value=(p?.tags||[]).join(', ');$('aiProvider').value=presetFor(p)||p?.provider||'custom';$('aiBaseUrl').value=p?.baseUrl||'';renderEditorModels(p?.model);$('aiDiscovered').hidden=true;$('aiProtocol').value=p?.protocol||({openai:'responses',deepseek:'chat-completions',claude:'anthropic'}[p?.provider])||'chat-completions';$('aiAuth').value=p?.auth||'bearer';$('aiKey').value='';$('aiKeyState').textContent=p?.hasKey?'密钥已保存；留空保留，填写新值则替换。修改接口地址需要重新填写。':'填写真实 API Key 后即可测试；可先测试再保存。';$('aiDialogStatus').textContent='';editorControls();protocolControls();syncPresetInfo();dialog.showModal();$('aiLabel').focus();}
 function editorControls(){for(const el of $('aiModelForm').querySelectorAll('input,select,button'))if(!['aiCancelDialog','aiCloseDialog','aiStopTests'].includes(el.id))el.disabled=dialogBusy;$('aiStopTests').hidden=!batch;$('aiStopTests').disabled=!!batch?.stop;}
 function draft(){return {...(dialogEditing?{profileId:dialogEditing.profileId,expectedRevision:dialogEditing.revision}:{}),label:$('aiLabel').value.trim(),models:draftModels.map(m=>({...m})),testReceipts:[...testReceipts.values()],...(testReceipt?{testReceipt}:{}),tags:$('aiTags').value.split(/[,，;；]/).map(t=>t.trim()).filter(Boolean),provider:freePresets[$('aiProvider').value]?.provider||$('aiProvider').value,baseUrl:$('aiBaseUrl').value.trim(),model:$('aiModel').value.trim(),protocol:$('aiProtocol').value,auth:$('aiAuth').value,...($('aiKey').value?{key:$('aiKey').value}:{})};}
 function rememberTest(model,r){if(!r)return;testReceipt=null;if(r.testReceipt)testReceipts.set(model,r.testReceipt);else testReceipts.delete(model);testResults.set(model,{ok:!!r.ok,code:r.code||'RESULT_UNKNOWN',unconfirmed:!r.testReceipt});renderEditorModels();editorControls();}
 $('aiStopTests').onclick=()=>{if(batch){batch.stop=true;$('aiBatchStatus').textContent+=' · 正在停止，等待当前请求结束…';editorControls()}};
 $('aiTestAll').onclick=async()=>{
  if(dialogBusy||!$('aiModelForm').reportValidity())return;const token=dialogSession,d=draft(),ids=draftModels.map(m=>m.id);if(!ids.length)return;const state=batch={stop:false};dialogBusy=true;editorControls();let completed=0,passed=0;
  try{for(const model of ids){if(state.stop||token!==dialogSession)break;$('aiBatchStatus').textContent='测试 '+(completed+1)+' / '+ids.length+' · '+model;
    let r;try{r=await send('ai-test-draft',{draft:{...d,model},confirmed:true})}catch(e){r=e.result||{ok:false,code:e.message}}
    if(token!==dialogSession||!dialog.open)return;rememberTest(model,r);completed++;if(r.ok)passed++;
   }
   if(token===dialogSession){$('aiBatchStatus').textContent=(state.stop?'已停止':'测试完成')+' · '+completed+' / '+ids.length+'，成功 '+passed+'，失败 '+(completed-passed);$('aiDialogStatus').textContent='点击保存，保留本次各模型测试结果。';}
  }finally{if(token===dialogSession){batch=null;dialogBusy=false;editorControls()}}
 };
 async function editorAction(save){if(dialogBusy||!$('aiModelForm').reportValidity())return;const token=dialogSession;dialogBusy=true;editorControls();$('aiDialogStatus').textContent=save?'正在保存…':'正在测试连接…';try{const d=draft();const r=await send(save?'ai-settings-save':'ai-test-draft',save?d:{draft:d,confirmed:true});if(token!==dialogSession||!dialog.open)return;if(save){update(r);$('aiKey').value='';dialog.close();setStatus('模型已保存。可设为默认，或在翻译、摘要中选择。')}else {testReceipt=r.testReceipt||null;rememberTest(d.model,r);$('aiDialogStatus').textContent='连接测试成功。保存后可在列表设为默认。';}}catch(e){if(token===dialogSession&&dialog.open){if(!save)rememberTest($('aiModel').value,e.result||{ok:false,code:e.message});$('aiDialogStatus').textContent=explain(e);}}finally{if(token===dialogSession){dialogBusy=false;editorControls();}}}
 dialog.addEventListener('close',()=>{if(batch)batch.stop=true;batch=null;dialogSession++;$('aiKey').value='';dialogEditing=null;dialogBusy=false;});
 $('aiCloseDialog').onclick=$('aiCancelDialog').onclick=()=>dialog.close();$('aiModelForm').onsubmit=e=>{e.preventDefault();editorAction(true)};$('aiTest').onclick=()=>editorAction(false);
 function syncPresetInfo(){
  const p=freePresets[$('aiProvider').value];const active=p&&$('aiBaseUrl').value.trim().replace(/\/+$/,'')===p.baseUrl&&$('aiProtocol').value===p.protocol;
  $('aiPresetInfo').hidden=!active;if(active){$('aiPresetKeyLink').href=p.keyUrl;$('aiPresetKeyLink').textContent='获取 '+p.label.split(' · ')[0]+' API Key ↗';}else $('aiPresetKeyLink').removeAttribute('href');
 }
 $('aiProvider').onchange=()=>{
  const presets={...freePresets,openai:{baseUrl:'https://api.openai.com/v1',model:'gpt-4.1-mini',protocol:'responses',label:'OpenAI'},deepseek:{baseUrl:'https://api.deepseek.com',model:'deepseek-flash',protocol:'chat-completions',label:'DeepSeek'},claude:{baseUrl:'https://api.anthropic.com',model:'',protocol:'anthropic',label:'Anthropic'}};
  const presetId=$('aiProvider').value,p=presets[presetId];
  if(p){
   $('aiBaseUrl').value=p.baseUrl;
   draftModels=p.models?p.models.map(m=>({...m})):presetId==='deepseek'?[{id:'deepseek-flash',label:'deepseek-flash'},{id:'deepseek-v4-pro',label:'deepseek-v4-pro'}]:p.model?[{id:p.model,label:p.model}]:[];
   renderEditorModels(p.model);$('aiProtocol').value=p.protocol;
   if(!$('aiLabel').value||Object.values(presets).some(v=>v.label===$('aiLabel').value))$('aiLabel').value=p.label;
   $('aiAuth').value=p.protocol==='anthropic'?'x-api-key':'bearer';
  }
  const tags=$('aiTags').value.split(/[,，;；]/).map(t=>t.trim()).filter(t=>t&&t!=='免费预设');
  if(freePresets[presetId]&&tags.length<10)tags.push('免费预设');$('aiTags').value=tags.join(', ');
  $('aiKey').value='';testReceipt=null;editorEpoch++;testReceipts.clear();testResults.clear();renderEditorModels($('aiModel').value);
  $('aiDiscovered').hidden=true;discoveredSelection.clear();$('aiKeyState').textContent=dialogEditing?.hasKey&&dialogEditing.baseUrl===$('aiBaseUrl').value?'留空保留已保存的密钥。':'请填写此服务的 API Key。';protocolControls();syncPresetInfo();
 };
 $('aiProtocol').onchange=()=>{protocolControls();syncPresetInfo()};$('aiModelForm').addEventListener('input',e=>{testReceipt=null;editorEpoch++;if(['aiKey','aiBaseUrl','aiProvider','aiProtocol','aiAuth'].includes(e.target.id)){testReceipts.clear();testResults.clear();renderEditorModels();}syncPresetInfo();$('aiDialogStatus').textContent='配置有改动，可测试后保存。'});
 $('aiAddModel').onclick=()=>openEditor(null);$('aiImportModels').onclick=()=>{preview=null;$('aiImportList').replaceChildren();$('aiApplyImport').disabled=true;$('aiImportStatus').textContent='选择配置来源，读取后勾选需要导入的模型。';importDialog.showModal()};$('aiCloseImport').onclick=()=>importDialog.close();importDialog.addEventListener('close',()=>{importSession++;preview=null;});
 async function readImport(source){const token=++importSession;preview=null;$('aiApplyImport').disabled=true;$('aiImportList').replaceChildren();$('aiImportStatus').textContent='正在读取模型…';try{const p=await send('ai-model-import-preview',{source});if(token!==importSession||!importDialog.open)return;preview=p;for(const item of p.items){const label=document.createElement('label'),check=document.createElement('input'),text=document.createElement('span');check.type='checkbox';check.value=item.candidateId;check.disabled=item.change==='same';check.checked=item.change==='add';text.textContent=(item.connectionChange?'连接参数变化；部分模型更新将独立保存。 ':'')+item.label+' · '+item.model+' · '+(item.conflict?'勾选将覆盖你的修改':item.change==='same'?'已导入':item.change==='ignored'?'勾选恢复已删除模型':item.change==='update'?'可更新':'可导入')+(item.verified?'':' · 模型 ID 待验证');label.append(check,text);$('aiImportList').append(label)}$('aiApplyImport').disabled=!p.items.length;$('aiImportStatus').textContent='共 '+p.items.length+' 个模型。';}catch(e){if(token===importSession)$('aiImportStatus').textContent=explain(e);}}
 $('aiImportWorkBuddy').onclick=()=>readImport('workbuddy');$('aiImportCc').onclick=()=>readImport('ccswitch');$('aiApplyImport').onclick=async()=>{if(!preview)return;const token=importSession,p=preview,ids=[...$('aiImportList').querySelectorAll('input:checked')].map(e=>e.value);$('aiApplyImport').disabled=true;try{const r=await send('ai-model-import-apply',{previewId:p.previewId,candidateIds:ids,overwriteIds:p.items.filter(i=>i.conflict&&ids.includes(i.candidateId)).map(i=>i.candidateId),restoreIds:p.items.filter(i=>i.change==='ignored'&&ids.includes(i.candidateId)).map(i=>i.candidateId)});update(r);if(token===importSession){importDialog.close();setStatus('模型已导入。请选择默认模型，或逐个测试连接。')}}catch(e){if(token===importSession){$('aiImportStatus').textContent=explain(e);$('aiApplyImport').disabled=false;}}};
 $('aiReconnect').onclick=()=>run(connect);$('aiReloadExtension').onclick=()=>chrome.runtime.reload();
 window.LibraryAi={send,selected,explain};run(connect);
})();
