/* Page translation is activated only by a user shortcut/context-menu gesture. */
async function togglePageTranslation(tab){
 if(!tab?.id||!/^https?:\/\//.test(tab.url||''))throw Error('此页面不支持网页翻译，请在普通网页使用');
 const key='page-translation:'+tab.id,token=crypto.randomUUID();
 const {translationDefaults={}}=await chrome.storage.local.get('translationDefaults');
 const prefs={route:['bilibili','model'].includes(translationDefaults.route)?translationDefaults.route:'free',targetLanguage:translationDefaults.targetLanguage||'zh',profileId:translationDefaults.profileId,model:translationDefaults.model,expectedRevision:translationDefaults.expectedRevision};
 if(prefs.route==='model'&&(!prefs.profileId||!prefs.model||!prefs.expectedRevision))throw Error('请在翻译设置中重新选择并保存网页翻译模型');
 await chrome.scripting.executeScript({target:{tabId:tab.id},files:['page-translation.js']});
 await chrome.storage.session.set({[key]:{token,url:tab.url,...prefs,characters:0}});
 try{const state=await chrome.tabs.sendMessage(tab.id,{action:'page-translation-toggle',token,...prefs});if(!state?.active)await chrome.storage.session.remove(key);await updatePageTranslationMenu(tab);return state;}catch(e){await chrome.storage.session.remove(key);throw e;}
}
function pageTranslationFailure(e){chrome.action.setTitle({title:'网页翻译：'+e.message}).catch(()=>{});chrome.storage.local.set({pageTranslationError:e.message});}
chrome.commands?.onCommand.addListener(async(command,tab)=>{if(command!=='toggle-page-translation')return;try{if(!tab) [tab]=await chrome.tabs.query({active:true,currentWindow:true});await togglePageTranslation(tab);}catch(e){pageTranslationFailure(e);}});
chrome.tabs?.onRemoved?.addListener(id=>chrome.storage.session.remove('page-translation:'+id));
async function pageTranslationChoices(session,includeModels=true){
 const choices=[{id:'free',route:'free',label:'微软 · 免 Key'},{id:'bilibili',route:'bilibili',label:'B站 · Index-Translate'}];let notice='';
 if(includeModels)try{
  const settings=await native({action:'ai-settings-get'});if(!settings?.ok)throw Error('unavailable');
  for(const profile of Object.values(settings.profiles||{})){
   if(!profile.hasKey)continue;
   for(const model of profile.models||[])if(model.lastTest?.ok&&model.lastTest.revision===profile.revision)choices.push({id:JSON.stringify([profile.profileId,model.id]),route:'model',label:profile.label+' · '+(model.label||model.id),profileId:profile.profileId,model:model.id,expectedRevision:profile.revision});
  }
 }catch{notice='未能读取已配置模型；可先选择免 Key 通道，或在模型设置中检查配套程序。';}
 const selected=choices.find(c=>c.route===session.route&&(c.route!=='model'||c.profileId===session.profileId&&c.model===session.model));
 return {choices,currentChoice:selected?.id||'',notice};
}
function handlePageTranslation(m,s,reply){
 if(!['page-translation-text','page-translation-stop','page-translation-options','page-translation-switch'].includes(m?.action))return;
 (async()=>{
  if(s.id!==chrome.runtime.id||!s.tab?.id||s.frameId!==0||!/^https?:\/\//.test(s.url||''))throw Error('网页翻译请求无效');
  const key='page-translation:'+s.tab.id,session=(await chrome.storage.session.get(key))[key];
  if(!session||session.token!==m.token||session.url!==s.url)throw Error('网页翻译已停止或页面已切换');
  if(m.action==='page-translation-stop'){await chrome.storage.session.remove(key);return {ok:true};}
  if(m.action==='page-translation-options'){
   const result=await pageTranslationChoices(session);
   return {ok:true,...result,choices:result.choices.map(({id,route,label})=>({id,route,label}))};
  }
  if(m.action==='page-translation-switch'){
   if(m.confirmed!==true)throw Error('请选择翻译路径并点击继续翻译');
   const result=await pageTranslationChoices(session,!['free','bilibili'].includes(m.choiceId)),choice=result.choices.find(c=>c.id===m.choiceId);
   if(!choice)throw Error('所选模型不可用，请重新读取并选择已测试成功的模型');
   const current=(await chrome.storage.session.get(key))[key];
   if(!current||current.token!==m.token||current.url!==s.url)throw Error('网页翻译已停止或页面已切换');
   const next={...current,token:crypto.randomUUID(),route:choice.route,profileId:choice.profileId,model:choice.model,expectedRevision:choice.expectedRevision};
   await chrome.storage.session.set({[key]:next});return {ok:true,token:next.token,route:choice.route,label:choice.label};
  }
  if(typeof m.text!=='string'||m.text.length>8000||session.characters+m.text.length>200000)throw Error('本页已达到翻译上限，请关闭后重新开启');
  session.characters+=m.text.length;await chrome.storage.session.set({[key]:session});
  const request={route:session.route,text:m.text,sourceLanguage:'auto',targetLanguage:session.targetLanguage};
  if(session.route==='model')return native({action:'ai-translate',text:m.text,sourceLanguage:'auto',targetLanguage:session.targetLanguage,profileId:session.profileId,model:session.model,expectedRevision:session.expectedRevision,temporary:true,confirmed:true});
  if(session.route==='bilibili'){const host=await native({action:'status'});if(!host.capabilities?.includes('free-translation-native-v1'))throw Error('请更新本地程序后使用B站翻译');return native({...request,action:'ai-free-translate'});}
  return typeof browserFreeTranslate==='function'?browserFreeTranslate(request):freeTranslate(request);
 })().then(reply,e=>reply({ok:false,error:e.message,code:e.code||e.message}));return true;
}

async function getPageTranslationState(tab){
 if(!tab?.id||!/^https?:\/\//.test(tab.url||''))return {active:false,phase:'unavailable'};
 try{return await chrome.tabs.sendMessage(tab.id,{action:'page-translation-state'});}catch{return {active:false,phase:'off'};}
}
async function updatePageTranslationMenu(tab){
 try{if(!tab)[tab]=await chrome.tabs.query({active:true,lastFocusedWindow:true});const state=await getPageTranslationState(tab);await chrome.contextMenus.update('translate-page',{title:state?.active?'精彩摘录 · 恢复原文（双语翻译已开启）':'精彩摘录 · 开启网页双语翻译',enabled:state?.phase!=='unavailable'});}catch{}
}
chrome.tabs?.onActivated?.addListener(()=>updatePageTranslationMenu());
chrome.tabs?.onUpdated?.addListener((id,change,tab)=>{if(change.status==='loading')chrome.storage.session.remove('page-translation:'+id);if(tab.active)updatePageTranslationMenu(tab);});
chrome.storage.onChanged?.addListener((changes,area)=>{if(area==='session'&&Object.keys(changes).some(k=>k.startsWith('page-translation:')))updatePageTranslationMenu();});
chrome.windows?.onFocusChanged?.addListener(()=>updatePageTranslationMenu());
function handlePageTranslationControl(message,sender,reply){
 if(sender.id!==chrome.runtime.id||sender.url?.split(/[?#]/)[0]!==chrome.runtime.getURL('app.html'))return;
 (async()=>{const tab=await chrome.tabs.get(message.tabId);if(message.action==='page-translation-control')await togglePageTranslation(tab);return {ok:true,...await getPageTranslationState(tab)};})().then(reply,e=>reply({ok:false,error:e.message}));return true;
}
