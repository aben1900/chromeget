/* Page translation is activated only by a user shortcut/context-menu gesture. */
async function togglePageTranslation(tab){
 if(!tab?.id||!/^https?:\/\//.test(tab.url||''))throw Error('此页面不支持网页翻译，请在普通网页使用');
 const key='page-translation:'+tab.id,token=crypto.randomUUID();
 const {translationDefaults={}}=await chrome.storage.local.get('translationDefaults');
 const prefs={route:translationDefaults.route==='bilibili'?'bilibili':'free',targetLanguage:translationDefaults.targetLanguage||'zh'};
 await chrome.scripting.executeScript({target:{tabId:tab.id},files:['page-translation.js']});
 await chrome.storage.session.set({[key]:{token,url:tab.url,...prefs,characters:0}});
 try{const state=await chrome.tabs.sendMessage(tab.id,{action:'page-translation-toggle',token,...prefs});if(!state?.active)await chrome.storage.session.remove(key);await updatePageTranslationMenu(tab);return state;}catch(e){await chrome.storage.session.remove(key);throw e;}
}
function pageTranslationFailure(e){chrome.action.setTitle({title:'网页翻译：'+e.message}).catch(()=>{});chrome.storage.local.set({pageTranslationError:e.message});}
chrome.commands?.onCommand.addListener(async(command,tab)=>{if(command!=='toggle-page-translation')return;try{if(!tab) [tab]=await chrome.tabs.query({active:true,currentWindow:true});await togglePageTranslation(tab);}catch(e){pageTranslationFailure(e);}});
chrome.tabs?.onRemoved?.addListener(id=>chrome.storage.session.remove('page-translation:'+id));
function handlePageTranslation(m,s,reply){
 if(!['page-translation-text','page-translation-stop'].includes(m?.action))return;
 (async()=>{
  if(s.id!==chrome.runtime.id||!s.tab?.id||s.frameId!==0||!/^https?:\/\//.test(s.url||''))throw Error('网页翻译请求无效');
  const key='page-translation:'+s.tab.id,session=(await chrome.storage.session.get(key))[key];
  if(!session||session.token!==m.token||session.url!==s.url)throw Error('网页翻译已停止或页面已切换');
  if(m.action==='page-translation-stop'){await chrome.storage.session.remove(key);return {ok:true};}
  if(typeof m.text!=='string'||m.text.length>8000||session.characters+m.text.length>200000)throw Error('本页已达到翻译上限，请关闭后重新开启');
  session.characters+=m.text.length;await chrome.storage.session.set({[key]:session});
  const request={route:session.route,text:m.text,sourceLanguage:'auto',targetLanguage:session.targetLanguage};
  if(session.route==='bilibili'){const host=await native({action:'status'});if(!host.capabilities?.includes('free-translation-native-v1'))throw Error('请更新本地程序后使用B站翻译');return native({...request,action:'ai-free-translate'});}
  return freeTranslate(request);
 })().then(reply,e=>reply({ok:false,error:e.message}));return true;
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
