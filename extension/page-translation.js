(() => {
 if(globalThis.__chromegetPageTranslation)return;globalThis.__chromegetPageTranslation=true;
 let active=false,token='',generation=0,observer,visibility,timer,pumping=false,queue=[],records=new Map(),cache=new Map(),bar,done=0,failed=0,halted=false,switching=false;
 const selector='p,li,h1,h2,h3,h4,h5,h6,blockquote,figcaption,td,th,article div,main div';
 const excluded='script,style,noscript,textarea,input,select,button,pre,code,[contenteditable]:not([contenteditable="false"]),[translate="no"],[hidden],[aria-hidden="true"],[data-chromeget-translation]';
 const explanations={CONFIG_CHANGED:'模型配置已变更，请重新选择模型',DEFAULT_MODEL_REQUIRED:'请先选择可用模型',MODEL_NOT_TESTED:'请先测试并保存模型',QUOTA_EXCEEDED:'模型额度不足',NETWORK_ERROR:'网络连接失败，可重试或更换翻译路径',NETWORK_TIMEOUT:'翻译请求超时，可重试或更换翻译路径',TRANSLATION_BLOCKED:'B站拒绝了请求，可稍后重试或更换路径'};
 function explain(response){const raw=response?.error||response?.message||response?.code||'翻译失败';return explanations[response?.code]||(/Failed to fetch|fetch failed/i.test(raw)?'未能连接翻译服务，请检查网络或代理，也可更换下方翻译路径。':raw);}
 function source(el){return [...el.childNodes].filter(n=>n.nodeType!==1||!n.hasAttribute('data-chromeget-translation')).map(n=>n.textContent).join('').trim();}
 async function request(message){let timeout;try{return await Promise.race([chrome.runtime.sendMessage(message),new Promise((_,reject)=>{timeout=setTimeout(()=>reject(Error('翻译请求超时，可重试或更换路径。')),65000);})]);}finally{clearTimeout(timeout);}}
 function status(){
  if(!bar)return;
  bar.label.textContent=halted?'翻译暂停 · 已完成 '+done+' 段 · '+failed+' 段失败':'双语翻译 · '+done+' 段'+(queue.length||pumping?' · 翻译中…':'');
  bar.recovery.hidden=!halted;bar.select.disabled=bar.resume.disabled=switching;bar.resume.disabled||=!bar.select.value;
 }
 function clearUnfinished(){queue=[];for(const r of records.values())if(!r.finished){r.pending=false;r.output.textContent='';r.output.hidden=true;r.output.style.display='none';}}
 function stop(){active=false;generation++;pumping=false;switching=false;observer?.disconnect();visibility?.disconnect();clearTimeout(timer);queue=[];for(const r of records.values())r.output.remove();records.clear();cache.clear();bar?.host.remove();bar=null;chrome.runtime.sendMessage({action:'page-translation-stop',token}).catch(()=>{});}
 function enqueue(el){const r=records.get(el);if(!r||r.pending||r.finished||halted)return;r.pending=true;r.output.hidden=false;r.output.style.display='block';r.output.textContent='翻译中…';queue.push(el);status();pump();}
 async function choices(){
  const run=generation;try{const response=await request({action:'page-translation-options',token});if(!active||run!==generation)return;if(!response?.ok)throw Error(explain(response));
   bar.select.replaceChildren();for(const choice of response.choices||[]){const option=document.createElement('option');option.value=choice.id;option.textContent=choice.label;option.dataset.route=choice.route;bar.select.append(option);}
   if(response.currentChoice)bar.select.value=response.currentChoice;bar.notice.textContent=response.notice||'';costHint();status();
  }catch(e){if(active&&run===generation){bar.notice.textContent='模型列表读取失败；可尝试免 Key 通道。';status();}}
 }
 function costHint(){if(bar)bar.cost.textContent=bar.select.selectedOptions[0]?.dataset.route==='model'?'继续后，未完成的网页文字将发送到所选模型，可能使用 API 额度。':'继续后，未完成的网页文字将发送到所选翻译服务。仅本页生效。';}
 async function resume(){
  if(!active||!halted||switching||!bar.select.value)return;switching=true;status();const run=generation,stateBar=bar;
  try{const response=await request({action:'page-translation-switch',token,choiceId:bar.select.value,confirmed:true});if(!active||run!==generation){if(response?.ok&&response.token)chrome.runtime.sendMessage({action:'page-translation-stop',token:response.token}).catch(()=>{});return;}if(!response?.ok)throw Error(explain(response));
   token=response.token;generation++;halted=false;failed=0;cache.clear();clearUnfinished();bar.error.textContent='';bar.route.textContent=response.label;watchVisibility();for(const [el,r]of records)if(!r.finished)visibility.observe(el);scan();
  }catch(e){if(active&&run===generation)bar.error.textContent=explain(e);}finally{if(bar===stateBar){switching=false;status();}}
 }
 async function pump(){
  if(pumping)return;const run=generation;pumping=run;
  try{while(active&&run===generation&&queue.length&&!halted){
   const el=queue.shift(),r=records.get(el);if(!r||!el.isConnected)continue;const text=source(el);if(text!==r.text){r.pending=false;schedule();continue;}
   try{let translated=cache.get(text);if(!translated){const response=await request({action:'page-translation-text',token,text});if(!response?.ok)throw Error(explain(response));translated=response.text;if(typeof translated!=='string'||!translated.trim())throw Error('翻译服务没有返回译文，请重试或更换路径');}
    if(!active||run!==generation)break;if(cache.size<1000)cache.set(text,translated);if(source(el)!==text){r.pending=false;schedule();continue;}
    r.output.textContent=translated;r.output.hidden=false;r.finished=true;done++;
   }catch(e){if(!active||run!==generation)break;failed++;halted=true;clearUnfinished();bar.error.textContent=explain(e);choices();}
   finally{r.pending=false;status();}
  }}finally{if(pumping===run){pumping=false;status();if(active&&queue.length&&!halted)pump();}}
 }
 function scan(){
  if(!active||halted)return;
  for(const [el,r]of records){if(!el.isConnected){r.output.remove();records.delete(el);}else if(source(el)!==r.text){r.output.remove();visibility.unobserve(el);records.delete(el);}}
  for(const el of [...document.querySelectorAll(selector)].slice(0,6000)){
   if(records.size>=1000)break;if(records.has(el)||el.closest(excluded)||el.querySelector(selector)||el.querySelector(excluded))continue;
   const text=source(el);if(text.length<3||text.length>8000||!/[\p{L}]/u.test(text)||!el.getClientRects().length)continue;
   const output=document.createElement('span');output.setAttribute('data-chromeget-translation','');output.lang=globalThis.__chromegetTarget;output.style.cssText='display:none;margin:0.45em 0 0.7em;line-height:1.65;font-size:1em;color:inherit;white-space:pre-wrap';output.hidden=true;
   el.append(output);records.set(el,{text,output,pending:false,finished:false});visibility.observe(el);
  }status();
 }
 function schedule(){clearTimeout(timer);timer=setTimeout(scan,300);}
 function watchVisibility(){visibility?.disconnect();visibility=new IntersectionObserver(entries=>{for(const e of entries)if(e.isIntersecting)enqueue(e.target);},{rootMargin:'600px'});}
 function start(m){
  active=true;halted=false;done=failed=0;token=m.token;generation++;globalThis.__chromegetTarget=m.targetLanguage;
  const host=document.createElement('div');host.setAttribute('data-chromeget-translation','');host.style.cssText='position:fixed;right:12px;bottom:12px;max-width:calc(100vw - 24px);z-index:2147483647';
  const shadow=host.attachShadow({mode:'closed'}),style=document.createElement('style');style.textContent='*{box-sizing:border-box}[hidden]{display:none!important}.box{font:14px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;background:#fff;color:#292929;border:1px solid #d8d8d8;border-radius:12px;padding:10px 12px;box-shadow:0 3px 18px #0002;max-width:380px}.head{display:flex;gap:10px;align-items:center}.head span{flex:1}.close{font-size:22px;border:0;background:none;cursor:pointer;color:inherit}.route,small{font-size:12px;color:#666}.route:empty{display:none}.recovery{border-top:1px solid #eee;margin-top:6px;padding-top:8px}p{margin:0 0 8px;overflow-wrap:anywhere}select,button{font:inherit;max-width:100%}select{width:100%;padding:7px;border:1px solid #ccc;border-radius:7px;background:#fff;color:#222}.continue{margin-top:8px;padding:7px 12px;background:#242424;color:#fff;border:0;border-radius:7px;cursor:pointer}button:disabled{opacity:.5;cursor:default}small{display:block;margin-top:6px}small:empty{display:none}label{display:block;margin-bottom:5px}';
  const box=document.createElement('div');box.className='box';const head=document.createElement('div');head.className='head';const label=document.createElement('span');label.setAttribute('role','status');const close=document.createElement('button');close.className='close';close.dataset.action='close';close.textContent='×';close.title='关闭双语翻译，恢复原文';close.setAttribute('aria-label',close.title);close.onclick=stop;head.append(label,close);
  const route=document.createElement('div');route.className='route';route.textContent=m.route==='model'?'已配置模型':m.route==='bilibili'?'B站 · Index-Translate':'微软 · 免 Key';
  const recovery=document.createElement('div');recovery.className='recovery';recovery.hidden=true;const error=document.createElement('p');error.setAttribute('role','alert');const field=document.createElement('label');field.textContent='更换翻译路径';const select=document.createElement('select');select.setAttribute('aria-label','翻译路径');for(const [id,text]of [['free','微软 · 免 Key'],['bilibili','B站 · Index-Translate']]){const option=document.createElement('option');option.value=id;option.dataset.route=id;option.textContent=text;select.append(option);}select.value=m.route==='bilibili'?'bilibili':'free';select.onchange=()=>{costHint();status();};field.append(select);
  const button=document.createElement('button');button.dataset.action='continue';button.className='continue';button.textContent='继续翻译未完成内容';button.onclick=resume;const cost=document.createElement('small'),notice=document.createElement('small');recovery.append(error,field,cost,button,notice);box.append(head,route,recovery);shadow.append(style,box);document.documentElement.append(host);bar={host,label,route,recovery,error,select,resume:button,cost,notice};costHint();
  watchVisibility();observer=new MutationObserver(changes=>{if(changes.some(c=>!c.target.parentElement?.closest('[data-chromeget-translation]')&&!(c.target.nodeType===1&&c.target.closest('[data-chromeget-translation]'))))schedule();});observer.observe(document.body,{childList:true,subtree:true,characterData:true});scan();
 }
 chrome.runtime.onMessage.addListener((m,s,reply)=>{if(m.action==='page-translation-state'){reply({active,phase:!active?'off':halted?'error':pumping||queue.length?'working':'on',done,failed});return;}if(m.action!=='page-translation-toggle')return;if(active)stop();else start(m);reply({active});});
})();
