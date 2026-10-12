/* Fixed public translation endpoints. No credentials, retries or paid fallback. */
const freeTranslationRoutes = Object.freeze({
 free:{label:'微软 · 免 Key',url:'https://edge.microsoft.com/translate/translatetext',limit:'最多 8,000 字；机器翻译',docs:'https://github.com/xnx3/translate'},
 bilibili:{label:'B站 · Index-Translate',url:'https://index-translate.bilibili.com/v1/chat/completions',limit:'经本地程序调用；最多 8,000 字；可能限流',docs:'https://github.com/bilibili/Index-Translate'},
});
async function freeTranslate(message, request = fetch) {
 const languages={zh:'zh-CHS','zh-TW':'zh-CHT',en:'en',ja:'ja',ko:'ko',fr:'fr',de:'de',es:'es',ru:'ru',pt:'pt',it:'it',ar:'ar'};
 const names={zh:'Simplified Chinese','zh-TW':'Traditional Chinese',en:'English',ja:'Japanese',ko:'Korean',fr:'French',de:'German',es:'Spanish',ru:'Russian',pt:'Portuguese',it:'Italian',ar:'Arabic'};
 const {text,sourceLanguage:from,targetLanguage:to}=message,route=message.route||'free';
 if(!Object.hasOwn(freeTranslationRoutes,route))throw Error('未知翻译通道');
 if(typeof text!=='string'||!text.trim()||Array.from(text).length>8000||!Object.hasOwn(languages,to)||(from!=='auto'&&!Object.hasOwn(languages,from)))throw Error('翻译内容或语言无效');
 const url=new URL(freeTranslationRoutes[route].url);let body,method='POST';
 if(route==='free'){url.searchParams.set('to',languages[to]);url.searchParams.set('isEnterpriseClient','false');if(from!=='auto')url.searchParams.set('from',languages[from]);body=JSON.stringify([text]);}
 if(route==='bilibili')body=JSON.stringify({model:'Index-Translate-35B-A3B',messages:[{role:'user',content:'Translate the following text '+(from==='auto'?'':('from '+names[from]+' '))+'into '+names[to]+'. Return only the translation and preserve line breaks.\n\n'+text}],stream:false,temperature:0,max_tokens:8192,chat_template_kwargs:{enable_thinking:false}});

 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),route==='bilibili'?45000:20000),started=Date.now();
 try{const response=await request(url.href,{method,...(body?{headers:{'Content-Type':'application/json'},body}:{}),credentials:'omit',redirect:'error',signal:controller.signal});
 if(!response.ok)throw Object.assign(Error(response.status===429?'免费翻译请求过于频繁，请稍后重试':'免费翻译服务拒绝请求或暂不可用（HTTP '+response.status+'），可更换翻译路径。'),{code:'TRANSLATION_HTTP_'+response.status});
 const data=await response.json();let translated;
 if(route==='free')translated=data?.[0]?.translations?.[0]?.text;
 if(route==='bilibili'){
  const choice=data?.choices?.[0];if(choice?.finish_reason!=='stop')throw Error('翻译结果不完整，请缩短原文后重试');
  translated=choice.message?.content;
  if(typeof translated==='string')translated=translated.replace(/<think>[\s\S]*?<\/think>/g,'').trim();
  if(translated?.includes('<think>'))throw Error('翻译结果不完整，请稍后重试');
 }

 if(typeof translated!=='string'||!translated.trim())throw Error('免费翻译未返回有效译文');
 return {ok:true,text:translated,provider:freeTranslationRoutes[route].label,model:route==='bilibili'?'Index-Translate-35B-A3B':'机器翻译',elapsedMs:Date.now()-started,detectedLanguage:route==='free'?data[0].detectedLanguage?.language||'':''};
 }catch(e){if(controller.signal.aborted)throw Object.assign(Error('免费翻译超时，可稍后重试或更换翻译路径。'),{code:'TRANSLATION_TIMEOUT'});if(e?.name==='TypeError'&&/fetch|network/i.test(e.message))throw Object.assign(Error((route==='free'?'微软':'B站')+'翻译连接失败，未收到服务响应。请检查浏览器网络或代理，或更换翻译路径。'),{code:route==='free'?'MICROSOFT_NETWORK_ERROR':'TRANSLATION_NETWORK_ERROR'});throw e;}finally{clearTimeout(timer);}
}
async function browserFreeTranslate(message){
 if((message.route||'free')==='free'&&typeof chrome!=='undefined'&&chrome.permissions?.contains){
  const granted=await chrome.permissions.contains({origins:['https://edge.microsoft.com/*']});
  if(!granted)throw Object.assign(Error('扩展没有微软翻译网站的访问权限。请重新加载扩展并允许该网站访问，或更换翻译路径。'),{code:'MICROSOFT_PERMISSION_REQUIRED'});
 }
 return freeTranslate(message);
}
if(typeof module!=='undefined')module.exports={freeTranslate,freeTranslationRoutes};
