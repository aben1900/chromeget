const {chromium}=require('playwright'),assert=require('assert/strict');
(async()=>{const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});try{
 const page=await browser.newPage({viewport:{width:320,height:700}});
 async function setup(mode){await page.goto('about:blank');await page.setContent('<main><p>Hello from a paragraph.</p></main>');await page.evaluate(mode=>{
  const attach=Element.prototype.attachShadow;Element.prototype.attachShadow=function(o){return window.bar=attach.call(this,o)};
  window.calls=[];window.chrome={runtime:{onMessage:{addListener:f=>window.control=f},sendMessage:async m=>{
   calls.push(m);
   if(m.action==='page-translation-options')return {ok:true,currentChoice:'free',choices:[{id:'free',route:'free',label:'微软'},{id:'model',route:'model',label:'测试通过的模型'}]};
   if(m.action==='page-translation-switch')return new Promise(resolve=>window.finishSwitch=()=>resolve({ok:true,token:'switched',route:'model',label:'模型'}));
   if(m.action==='page-translation-stop')return {ok:true};
   if(mode==='pending'&&m.token==='old')return new Promise(resolve=>window.finishOld=()=>resolve({ok:true,text:'旧响应'}));
   if(mode==='switch')return {ok:false,error:'Failed to fetch'};
   return {ok:true,text:'新的译文'};
  }}};
 },mode);await page.addScriptTag({path:'extension/page-translation.js'});await page.evaluate(()=>control({action:'page-translation-toggle',token:'old',route:'free',targetLanguage:'zh'},null,()=>{}));}
 await setup('pending');await page.waitForFunction(()=>!!window.finishOld);
 await page.evaluate(()=>{bar.querySelector('[data-action=close]').click();control({action:'page-translation-toggle',token:'new',route:'free',targetLanguage:'zh'},null,()=>{});});
 await page.waitForFunction(()=>calls.some(m=>m.action==='page-translation-text'&&m.token==='new'),{},{timeout:2000});
 await page.evaluate(()=>finishOld());await page.waitForFunction(()=>document.querySelector('p span')?.textContent==='新的译文');
 await setup('switch');await page.waitForFunction(()=>bar.querySelector('option[value=model]'));
 await page.evaluate(()=>{const s=bar.querySelector('select');s.value='model';s.dispatchEvent(new Event('change'));});
 assert.match(await page.evaluate(()=>bar.querySelector('small').textContent),/API/);
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 await page.evaluate(()=>bar.querySelector('[data-action=continue]').click());await page.waitForFunction(()=>!!window.finishSwitch);
 await page.evaluate(()=>{bar.querySelector('[data-action=close]').click();finishSwitch();});
 await page.waitForFunction(()=>calls.some(m=>m.action==='page-translation-stop'&&m.token==='switched'),{},{timeout:2000});
 assert.equal(await page.locator('[data-chromeget-translation]').count(),0);
 assert.equal(await page.evaluate(()=>calls.filter(m=>m.action==='page-translation-text').length),1);
 console.log('PASS reopen ignores old requests; closing during route switch stops new session; narrow screen and model cost hint');
}finally{await browser.close()}})().catch(e=>{console.error(e);process.exitCode=1});
