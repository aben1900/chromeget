(()=>{
 const button=document.getElementById('pageTranslationToggle'),feedback=document.getElementById('pageTranslationFeedback');let busy=false,epoch=0,currentTab=null,currentState={};
 const tab=async()=> (await chrome.tabs.query({active:true,currentWindow:true}))[0];
 function render(s){currentState=s;button.setAttribute('aria-pressed',String(!!s.active));button.dataset.phase=s.phase||'off';button.disabled=busy;const label=s.phase==='unavailable'?'此页面不支持双语翻译':s.active?(s.phase==='error'?'翻译已暂停，点击恢复原文':s.phase==='working'?'正在翻译，点击恢复原文':'双语翻译已开启，点击恢复原文'):'开启网页双语翻译';button.title=label;button.setAttribute('aria-label',label);button.setAttribute('aria-busy',String(busy||s.phase==='working'));}
 function error(message){feedback.textContent=message;feedback.hidden=false;}
 async function refresh(){const run=++epoch;try{const t=await tab();if(run!==epoch)return;currentTab=t;const s=await chrome.runtime.sendMessage({action:'page-translation-status',tabId:t?.id});if(run===epoch&&!busy){render(s?.ok?s:{phase:'off'});if(!s?.ok)error(s?.error||'后台未响应，请重新加载扩展并重开侧栏');}}catch(e){if(run===epoch&&!busy){render({phase:'off'});error('无法读取网页状态：'+e.message);}}}
 // Request optional origin access directly inside the click gesture, before any await.
 button.onclick=()=>{if(busy)return;const t=currentTab;if(!/^https?:\/\//.test(t?.url||'')){error('请先切换到普通网页，再点击网页翻译');refresh();return;}
 let permission;try{permission=currentState.active?Promise.resolve(true):chrome.permissions.request({origins:[new URL(t.url).origin+'/*']});}catch(e){error(e.message);return;}
 busy=true;epoch++;button.disabled=true;button.setAttribute('aria-busy','true');feedback.hidden=true;
 (async()=>{try{if(!await permission)throw Error('未获得当前网站访问权限，请允许后再试');const latest=await tab();if(latest?.id!==t.id||latest.url!==t.url)throw Error('当前网页已切换，请重新点击翻译');const s=await chrome.runtime.sendMessage({action:'page-translation-control',tabId:t.id});if(!s?.ok)throw Error(s?.error||'网页翻译未响应，请重新加载扩展并重开侧栏');render(s);}catch(e){error(e.message);}finally{busy=false;refresh();}})();};
 chrome.tabs.onActivated.addListener(()=>{currentTab=null;refresh();});chrome.tabs.onUpdated.addListener((id,change)=>{if(change.status||change.url){if(currentTab?.id===id)currentTab=null;refresh();}});chrome.storage.onChanged.addListener((changes,area)=>{if(area==='session'&&Object.keys(changes).some(k=>k.startsWith('page-translation:')))refresh();});window.addEventListener('focus',refresh);setInterval(()=>{if(!document.hidden)refresh();},1500);refresh();
})();
