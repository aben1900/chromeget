(() => {
 const $=id=>document.getElementById(id);
 let profiles={},epoch=0,busy=false,ready=false,connected=false;
 const messages={EXTENSION_RELOAD_REQUIRED:'扩展后台未返回响应。请点击“重新加载扩展”，再重新打开资料库。',KEY_NOT_CONFIGURED:'请填写真实 API Key，占位示例不可用。',KEY_DECRYPT_FAILED:'密钥无法解密，请重新填写并保存。',AUTH_FAILED:'密钥无效或无访问权限，请检查 API Key。',RATE_LIMITED:'服务额度或速率受限，请稍后主动重试。',MODEL_UNAVAILABLE:'模型或接口不可用，请检查高级设置。',CONFIG_INVALID:'配置格式无效，请检查基础地址和模型。',CONFIG_CHANGED:'配置已变化，请重新准备摘要。',CC_CONFIG_UNAVAILABLE:'无法读取 CC-Switch Claude 配置，请检查本机配置。',INPUT_TOO_LARGE:'正文超过 24000 字或 96 KiB，本次未发送。',INPUT_UNSUPPORTED:'此类型暂不支持摘要。',INPUT_EMPTY:'原文为空。',SOURCE_CHANGED:'原文已变化，请重新打开资料并准备摘要。',SUMMARY_CONFLICT:'摘要已在其他操作中变化，草稿保留，请重新读取。',PREVIEW_EXPIRED:'预览已过期，请重新准备摘要。',ALREADY_RUNNING:'这条资料正在生成，请核对原请求结果。',NETWORK_TIMEOUT:'请求超时，结果尚未确认，请核对结果。',NETWORK_ERROR:'网络请求未完成，请核对结果，不会自动重发。',RESULT_UNKNOWN:'结果尚未确认，不会自动重发。',OUTPUT_INCOMPLETE:'模型输出不完整，本次未保存，请检查模型设置。',RESPONSE_INVALID:'模型没有返回可用的完整摘要。',RESPONSE_TOO_LARGE:'模型响应过大，本次未保存。',REQUEST_INVALID:'请求已失效，请重新打开资料核对。'};
 function explain(e){return messages[e?.message]||e?.message||'操作未完成，请检查本地程序连接。';}
 async function send(action,extra={}){
  let r;try{r=await chrome.runtime.sendMessage({action,...extra});}catch(e){if(/Receiving end|context invalidated|message port closed|connection.*establish/i.test(e.message))throw Error('EXTENSION_RELOAD_REQUIRED');throw e;}
  if(r===undefined||r===null)throw Error('EXTENSION_RELOAD_REQUIRED');
  if(!r.ok)throw Error(r.error||r.code||'本地程序未完成操作，请运行“开始使用.cmd → 更新 / 修复”。');
  return r;
 }
 function controls(){
  const p=profiles[$('aiProvider').value],valid=connected&&!!p,cc=p?.source==='ccswitch';
  for(const id of ['aiSaveSettings','aiClearKey','aiKey','aiModelChoice'])$(id).disabled=busy||!valid;
  $('aiProvider').disabled=busy;for(const id of ['aiOpenaiSource','aiDeepseekSource','aiCompanySource','aiCcProfile'])$(id).disabled=busy;$('aiCustomModel').disabled=busy||!valid;
  $('aiBaseUrl').disabled=busy||!valid||cc;
  $('aiLoadCc').disabled=busy||!connected;$('aiReconnect').disabled=busy;
  $('aiTest').disabled=busy||!ready;$('aiNext').hidden=!ready;
 }
 function selected(){const p=profiles[$('aiProvider').value];if(!p||!ready)throw Error('请先保存智能摘要配置。');return {...p,model:$('aiModel').value};}
 function invalidate(){epoch++;ready=false;$('aiSettingsStatus').textContent='配置有改动，请先保存，再测试连接。';window.dispatchEvent(new Event('ai-profile-changed'));controls();}
 function models(p){
  const candidates=[...(p.models||[])];if(!candidates.some(m=>m.id===p.model))candidates.unshift({id:p.model,roles:['当前']});
  $('aiModelChoice').replaceChildren(...candidates.map(m=>new Option(m.id+(m.roles?.length?' · '+m.roles.join(' / '):''),m.id)),new Option('自定义模型…','__custom'));
  $('aiModelChoice').value=p.model;$('aiModel').value=p.model;$('aiCustomModel').value=p.model;$('aiCustomModelLabel').hidden=true;
 }
 function render(id){
  const p=profiles[id];$('aiProvider').value=id;$('aiKey').value='';const company=id==='ccswitch'||id.startsWith('cc:');$('aiStep2').textContent=company?'直接测试':'保存并测试';$('aiCompanyInfo').hidden=$('aiCcProfileLabel').hidden=!company;$('aiAdvanced').hidden=$('aiSaveSettings').hidden=company;for(const [button,active] of [['aiOpenaiSource',id==='openai'],['aiDeepseekSource',id==='deepseek'],['aiCompanySource',company]]){$(button).setAttribute('aria-pressed',String(active));}if(p&&company)$('aiCcProfile').value=id;
  if(!p){ready=false;$('aiKeyLabel').hidden=id==='ccswitch';$('aiClearKey').hidden=id==='ccswitch';$('aiModelChoice').replaceChildren(new Option('请先读取 CC-Switch 配置',''));$('aiModel').value='';$('aiKeyState').textContent='点击“读取 CC-Switch 配置”，然后选择配置与模型。';window.dispatchEvent(new Event('ai-profile-changed'));controls();return;}
  $('aiBaseUrl').value=p.baseUrl;models(p);$('aiKeyLabel').hidden=p.source==='ccswitch';$('aiClearKey').hidden=p.source==='ccswitch';
  $('aiKeyState').textContent=p.hasKey?(p.source==='ccswitch'?'使用已有凭据，无需填写 SK。':'密钥已保存；如需更换，在上方填写新 SK。'):'尚未设置密钥，请填写真实 SK 并保存。';
  ready=connected&&p.hasKey;controls();window.dispatchEvent(new Event('ai-profile-changed'));
 }
 function report(e){
  $('aiSettingsStatus').textContent=explain(e);
  if(e.message==='EXTENSION_RELOAD_REQUIRED'){connected=false;ready=false;$('aiConnection').textContent='扩展后台需要重新加载，本地程序状态尚未核对。';$('aiReloadExtension').hidden=$('aiReloadHint').hidden=false;}
  controls();
 }
 async function run(fn){if(busy)return;busy=true;controls();try{await fn();}catch(e){report(e);}finally{busy=false;controls();}}
 async function connect(){
  $('aiConnection').textContent='正在核对扩展与本地程序连接…';const r=await send('ai-settings-get');profiles={...profiles,...r.profiles};connected=true;
  const local=await chrome.storage.local.get('aiSelection');render(profiles[local.aiSelection?.profileId]?local.aiSelection.profileId:'openai');
  $('aiConnection').textContent='已连接本地程序';$('aiReloadExtension').hidden=$('aiReloadHint').hidden=true;$('aiSettingsStatus').textContent='连接正常，可配置模型。';
 }
 $('aiProvider').addEventListener('change',()=>{epoch++;render($('aiProvider').value);$('aiSettingsStatus').textContent='';});
 for(const id of ['aiKey','aiBaseUrl'])$(id).addEventListener('input',invalidate);
 function modelChanged(){const id=$('aiProvider').value,p=profiles[id];if(p?.source==='ccswitch'){p.model=$('aiModel').value.trim();ready=connected&&p.hasKey&&!!p.model;epoch++;controls();window.dispatchEvent(new Event('ai-profile-changed'));chrome.storage.local.set({aiSelection:{profileId:id,model:p.model}}).catch(report);$('aiSettingsStatus').textContent='公司模型已选择，可直接测试或生成摘要；个人 API 配置未改动。';}else invalidate();}
 $('aiModelChoice').addEventListener('change',()=>{const custom=$('aiModelChoice').value==='__custom';$('aiCustomModelLabel').hidden=!custom;$('aiModel').value=custom?$('aiCustomModel').value:$('aiModelChoice').value;modelChanged();});
 $('aiCustomModel').addEventListener('input',()=>{$('aiModel').value=$('aiCustomModel').value;modelChanged();});
 for(const [button,id] of [['aiOpenaiSource','openai'],['aiDeepseekSource','deepseek']])$(button).addEventListener('click',()=>{epoch++;render(id);$('aiSettingsStatus').textContent='个人外网 API：只使用你为此服务保存的 SK。';});
 $('aiCompanySource').addEventListener('click',()=>{epoch++;render('ccswitch');$('aiLoadCc').click();});
 $('aiCcProfile').addEventListener('change',()=>{epoch++;render($('aiCcProfile').value);modelChanged();});
 $('aiSaveSettings').addEventListener('click',()=>run(async()=>{
  const id=$('aiProvider').value;const model=$('aiModel').value.trim();if(!model)throw Error('请填写模型 ID。');
  if(id.startsWith('cc:')){profiles[id].model=model;render(id);}else{const key=$('aiKey').value;const r=await send('ai-settings-save',{profileId:id,baseUrl:$('aiBaseUrl').value,model,...(key?{key}:{})});Object.assign(profiles,r.profiles);render(id);}
  await chrome.storage.local.set({aiSelection:{profileId:id,model:profiles[id].model}});
  $('aiSettingsStatus').textContent=ready?'配置已保存。现在可点击“测试连接”，或去选择摘录生成摘要。':'设置已保存，但尚未填写有效 SK。';
 }));
 $('aiClearKey').addEventListener('click',()=>run(async()=>{const id=$('aiProvider').value;const r=await send('ai-settings-save',{profileId:id,clearKey:true});Object.assign(profiles,r.profiles);render(id);$('aiSettingsStatus').textContent='密钥已清除';}));
 $('aiLoadCc').addEventListener('click',()=>run(async()=>{
  const r=await send('ai-ccswitch-list'),local=await chrome.storage.local.get('aiSelection');
  for(const option of [...$('aiProvider').options])if(option.value.startsWith('cc:'))option.remove();for(const id of Object.keys(profiles))if(id.startsWith('cc:'))delete profiles[id];
  $('aiCcProfile').replaceChildren();for(const p of r.profiles){$('aiCcProfile').add(new Option(p.label,p.profileId));$('aiProvider').add(new Option('CC-Switch · '+p.label,p.profileId));profiles[p.profileId]=p;}
  if(!r.profiles.length){render('ccswitch');throw Error('未找到可用的 Claude 配置。');}
  const remembered=r.profiles.find(p=>p.profileId===local.aiSelection?.profileId),p=remembered||r.profiles.find(p=>/yqn/i.test(p.label))||r.profiles[0];
  if(remembered&&typeof local.aiSelection.model==='string'&&local.aiSelection.model.trim())p.model=local.aiSelection.model;
  epoch++;render(p.profileId);modelChanged();
 }));
 $('aiTest').addEventListener('click',()=>run(async()=>{const p=selected();$('aiSettingsStatus').textContent='正在测试 '+p.label+' · '+p.model+'…';await send('ai-test',{profileId:p.profileId,model:p.model,confirmed:true});$('aiSettingsStatus').textContent='连接测试成功。点击“去选择摘录”即可开始。';}));
 $('aiReconnect').addEventListener('click',()=>run(connect));
 $('aiReloadExtension').addEventListener('click',()=>chrome.runtime.reload());
 $('aiUse').addEventListener('click',()=>{$('aiSettings').open=false;$('query').focus();$('searchForm').scrollIntoView({block:'start'});$('status').textContent='选择一条文字摘录，点击卡片上的“生成摘要”。';});
 window.LibraryAi={send,selected,explain};run(connect);
})();
