(() => {
 const messages={TRANSLATION_BLOCKED:'B站仍拒绝当前请求（412），请稍后重试或手动选择微软翻译。',EXTENSION_RELOAD_REQUIRED:'扩展后台未返回响应。请点击“重新加载扩展”，再重新打开资料库。',KEY_NOT_CONFIGURED:'请填写真实 API Key，占位示例不可用。',KEY_DECRYPT_FAILED:'密钥无法解密，请重新填写并保存。',AUTH_FAILED:'密钥无效或无访问权限，请检查 API Key。',RATE_LIMITED:'请求速率受限，请稍后主动重试。',MODEL_UNAVAILABLE:'模型或接口不可用，请检查高级设置。',CONFIG_INVALID:'配置格式无效，请检查基础地址和模型。',CONFIG_CHANGED:'配置已变化，请重新准备摘要。',CC_CONFIG_UNAVAILABLE:'无法读取 CC-Switch Claude 配置，请检查本机配置。',INPUT_TOO_LARGE:'正文超过 24000 字或 96 KiB，本次未发送。',INPUT_UNSUPPORTED:'此类型暂不支持摘要。',INPUT_EMPTY:'原文为空。',SOURCE_CHANGED:'原文已变化，请重新打开资料并准备摘要。',SUMMARY_CONFLICT:'摘要已在其他操作中变化，草稿保留，请重新读取。',PREVIEW_EXPIRED:'预览已过期，请重新准备摘要。',ALREADY_RUNNING:'这条资料正在生成，请核对原请求结果。',NETWORK_TIMEOUT:'请求超时，结果尚未确认，请核对结果。',NETWORK_ERROR:'网络请求未完成，请核对结果，不会自动重发。',RESULT_UNKNOWN:'结果尚未确认，不会自动重发。',OUTPUT_INCOMPLETE:'模型输出不完整，本次未保存，请检查模型设置。',RESPONSE_INVALID:'模型没有返回可用的完整摘要。',RESPONSE_TOO_LARGE:'模型响应过大，本次未保存。',REQUEST_INVALID:'请求已失效，请重新打开资料核对。'};
 function explain(e){const code=e?.message;if(/^TRANSLATION_HTTP_\d{3}$/.test(code||'')){const status=code.slice(-3);return status==='429'?'免费翻译请求过于频繁，请稍后重试或更换翻译路径。':'免费翻译服务拒绝请求或暂不可用（HTTP '+status+'），可更换翻译路径。';}return messages[code]||code||'操作未完成，请检查本地程序连接。';}
 async function send(action,extra={}){
  let r;try{r=await chrome.runtime.sendMessage({action,...extra});}catch(e){if(/Receiving end|context invalidated|message port closed|connection.*establish/i.test(e.message))throw Error('EXTENSION_RELOAD_REQUIRED');throw e;}
  if(r===undefined||r===null)throw Error('EXTENSION_RELOAD_REQUIRED');
  if(!r.ok){const e=Error(r.code||r.error||'本地程序未完成操作，请运行“开始使用.cmd → 更新 / 修复”。');e.result=r;throw e;}
  return r;
 }
 Object.assign(messages,{QUOTA_EXCEEDED:'服务返回 API 额度不足。API Key 的额度与 ChatGPT / Codex 订阅余量独立，请检查该 Key 所属 API 账户的余额和用量限制。',REGION_UNSUPPORTED:'服务不支持当前请求所在地区。',PERMISSION_DENIED:'当前密钥没有访问权限，请检查项目和模型权限。',API_REQUEST_REJECTED:'接口拒绝请求参数，请检查协议、接口地址和模型 ID。',SERVICE_UNAVAILABLE:'模型服务暂时不可用，请稍后重试。',MODEL_NOT_TESTED:'请先测试该模型并保存，再设为默认。',DEFAULT_MODEL_REQUIRED:'请在模型管理中为一个已配置模型点击“设为默认”。',IMPORT_UNAVAILABLE:'未读取到可用配置。请检查 WorkBuddy 配置，或选择 CC-Switch 导入。',IMPORT_CHANGED:'来源或本地配置已变化，请重新读取再导入。',IMPORT_CONFLICT:'此项有本地修改，请明确勾选覆盖后再导入。',MODELS_UNAVAILABLE:'接口不支持读取模型清单。',CONFIG_LIMIT:'最多保存 200 份配置，每份最多 200 个模型。'});
 Object.assign(messages,{
  MICROSOFT_NETWORK_ERROR:'微软翻译连接失败，未收到服务响应。请检查浏览器网络或代理，或更换翻译路径。',
  TRANSLATION_NETWORK_ERROR:'翻译服务连接失败，请检查网络或更换翻译路径。',
  TRANSLATION_TIMEOUT:'翻译请求超时，请稍后重试或更换翻译路径。',
  MICROSOFT_PERMISSION_REQUIRED:'缺少微软翻译网站访问权限，请重新加载扩展并检查权限，或更换翻译路径。',
  IP_ACCESS_DENIED:'智谱拒绝当前网络出口 IP（1220）。请检查代理出口或平台 IP 访问限制；仍失败时联系智谱客服。',
  PERMISSION_DENIED:'服务拒绝访问（403）。请检查账户、模型权限或网络出口限制。'
 });
 // Official public APIs only. Partner extensions' keyless gateways are not public API credentials.
 const freePresets={
  'zhipu-free':{provider:'custom',label:'智谱 · 免费模型',baseUrl:'https://open.bigmodel.cn/api/paas/v4',protocol:'chat-completions',auth:'bearer',model:'glm-4-flash-250414',models:[{id:'glm-4-flash-250414',label:'GLM-4-Flash-250414 · 翻译 / 摘要'},{id:'glm-4-flash',label:'GLM-4-Flash · 翻译 / 摘要'}],tags:['免费预设'],keyUrl:'https://bigmodel.cn/usercenter/proj-mgmt/apikeys',docsUrl:'https://docs.bigmodel.cn/cn/guide/models/free/glm-4-flash-250414'},
  'siliconflow-free':{provider:'custom',label:'硅基流动 · 免费模型',baseUrl:'https://api.siliconflow.cn/v1',protocol:'chat-completions',auth:'bearer',model:'THUDM/GLM-4-9B-0414',models:[{id:'THUDM/GLM-4-9B-0414',label:'GLM-4-9B · 翻译 / 摘要'},{id:'Qwen/Qwen2.5-7B-Instruct',label:'Qwen2.5-7B · 翻译 / 摘要'}],tags:['免费预设'],keyUrl:'https://cloud.siliconflow.cn/account/ak',docsUrl:'https://docs.siliconflow.cn/docs/userguide/introduction'}
 };
 function presetFor(p){return Object.entries(freePresets).find(([,v])=>p?.baseUrl?.replace(/\/+$/,'')===v.baseUrl&&p.protocol===v.protocol&&(p.models?.length?p.models:[{id:p.model}]).every(m=>v.models.some(x=>x.id===m.id)))?.[0]||'';}
 const catalogGroups={balanced:'日常摘要 · 均衡',strong:'复杂分析 · 高能力参考',fast:'批量处理 · 轻量快速',special:'专用模型 · 非普通摘要',unknown:'未分类 · 请核对用途'};
 function catalogGroup(id){
  const n=id.toLowerCase();
  if(Object.values(freePresets).some(p=>p.models.some(m=>m.id.toLowerCase()===n)))return 'fast';
  if(/embedding|moderation|whisper|tts|audio|realtime|transcrib|image|dall-e|sora|codex|deep-research|search|computer-use/.test(n))return 'special';
  if(!/^(gpt-|o[134](?:-|$)|chatgpt-)/.test(n))return 'unknown';
  if(/nano|mini|luna/.test(n))return 'fast';
  if(/pro|astra|^o[134](?:-|$)|^gpt-[56]/.test(n)&&!/-sol/.test(n))return 'strong';
  return 'balanced';
 }
 function modelChoice(m){return '【'+catalogGroups[catalogGroup(m.id)]+'】'+(m.label===m.id?m.id:m.label+' · '+m.id)}
window.LibraryAiApi={send,explain,modelChoice,catalogGroups,catalogGroup,freePresets,presetFor};
})();
