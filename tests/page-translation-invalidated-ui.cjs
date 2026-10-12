const {chromium}=require('playwright'),assert=require('assert/strict');

(async()=>{
 const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
 const failures=[];
 try{
  async function scenario(name,run){
   const page=await browser.newPage(),errors=[];
   page.on('pageerror',e=>errors.push(e.message));
   try{
    await page.setContent('<main><p id="done">First paragraph has completed.</p><p id="pending">Second paragraph is pending.</p><p id="queued">Third paragraph is queued.</p></main>');
    await page.evaluate(()=>{
     const attach=Element.prototype.attachShadow;Element.prototype.attachShadow=function(o){return window.bar=attach.call(this,o)};
     window.calls=[];window.invalid=false;window.rejectRuntime=false;window.routeFailure=false;
     // Only the Chrome runtime boundary is simulated; DOM, observers and the content script are real.
     window.chrome={runtime:{onMessage:{addListener:f=>window.control=f},sendMessage:m=>{
      calls.push(m);
      if(invalid){const error=Error('Extension context invalidated.');if(rejectRuntime)return Promise.reject(error);throw error;}
      if(m.action==='page-translation-stop')return Promise.resolve({ok:true});
      if(m.action==='page-translation-options')return Promise.resolve({ok:true,currentChoice:'free',choices:[{id:'free',route:'free',label:'微软'}]});
      if(m.action==='page-translation-switch')return new Promise(resolve=>window.finishSwitch=()=>resolve({ok:true,token:'switched',route:'free',label:'微软'}));
      if(m.text.startsWith('First'))return Promise.resolve({ok:true,text:'第一段译文'});
      if(routeFailure)return Promise.resolve({ok:false,error:'Failed to fetch'});
      return new Promise((resolve,reject)=>{window.finishText=resolve;window.failText=reject;});
     }}};
    });
    await page.addScriptTag({path:'extension/page-translation.js'});
    await run(page,errors);
    console.log('PASS '+name);
   }catch(e){failures.push(name+': '+e.stack);}finally{await page.close();}
  }
  const start=p=>p.evaluate(()=>control({action:'page-translation-toggle',token:'start',route:'free',targetLanguage:'zh'},null,()=>{}));
  async function assertRefresh(p){
   await p.waitForFunction(()=>bar.querySelector('[role=alert]').textContent.includes('刷新'),{},{timeout:2000});
   assert.match(await p.evaluate(()=>bar.querySelector('[role=alert]').textContent),/网页/);
   assert.equal(await p.evaluate(()=>bar.querySelector('select').checkVisibility()),false,'route switching cannot repair a dead extension context');
   assert.equal(await p.evaluate(()=>bar.querySelector('[data-action=continue]').checkVisibility()),false);
   assert.equal(await p.locator('#done span').textContent(),'第一段译文','keep completed translations');
   assert.ok(!(await p.locator('main').textContent()).includes('翻译中'),'clear unfinished placeholders');
   const before=await p.evaluate(()=>calls.length);
   await p.evaluate(()=>{const el=document.createElement('p');el.id='later';el.textContent='A newly added paragraph.';document.querySelector('main').append(el);bar.querySelector('[data-action=continue]').click();});
   await p.waitForTimeout(450);
   assert.equal(await p.locator('#later span').count(),0,'stop observing page changes');
   assert.equal(await p.evaluate(()=>calls.length),before,'do not send queued text or recovery requests');
   await p.evaluate(()=>bar.querySelector('[data-action=close]').click());
   assert.equal(await p.locator('[data-chromeget-translation]').count(),0,'explicit close removes preserved translations');
   assert.equal(await p.locator('#done').textContent(),'First paragraph has completed.');
  }
  await scenario('closing after reload contains a synchronous runtime exception',async(p,errors)=>{
   await start(p);await p.waitForFunction(()=>!!window.finishText);
   await p.evaluate(()=>{invalid=true;bar.querySelector('[data-action=close]').click();});
   await p.waitForTimeout(50);
   assert.deepEqual(errors,[],'close must not throw into the page');
   assert.equal(await p.locator('[data-chromeget-translation]').count(),0);
  });
  for(const rejectRuntime of [false,true])await scenario('queued translation detects '+(rejectRuntime?'rejected':'synchronous')+' invalidation and requests refresh',async(p,errors)=>{
   await start(p);await p.waitForFunction(()=>!!window.finishText);
   await p.evaluate(reject=>{invalid=true;rejectRuntime=reject;finishText({ok:true,text:'第二段译文'});},rejectRuntime);
   await assertRefresh(p);assert.deepEqual(errors,[]);
  });
  await scenario('in-flight invalidation clears pending paragraphs',async(p,errors)=>{
   await start(p);await p.waitForFunction(()=>!!window.failText);
   await p.evaluate(()=>{invalid=true;failText(Error('Extension context invalidated.'));});
   await assertRefresh(p);assert.deepEqual(errors,[]);
  });
  await scenario('late route-switch cleanup after reload is contained',async(p,errors)=>{
   await p.evaluate(()=>routeFailure=true);await start(p);
   await p.waitForFunction(()=>!bar.querySelector('.recovery').hidden);
   await p.evaluate(()=>bar.querySelector('[data-action=continue]').click());await p.waitForFunction(()=>!!window.finishSwitch);
   await p.evaluate(()=>{bar.querySelector('[data-action=close]').click();invalid=true;finishSwitch();});
   await p.waitForTimeout(100);
   assert.deepEqual(errors,[],'late session cleanup must not reject without a handler');
   assert.equal(await p.locator('[data-chromeget-translation]').count(),0);
  });
  assert.deepEqual(failures,[]);
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
