const {chromium}=require('playwright'),assert=require('assert/strict');
(async()=>{
 const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
 try{
  const page=await browser.newPage({viewport:{width:340,height:700}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  async function setup(pending=false){
   await page.goto('about:blank');await page.setContent('<main><p id="done">First paragraph.</p></main>');
   await page.evaluate(pending=>{
    const attach=Element.prototype.attachShadow;Element.prototype.attachShadow=function(o){return window.bar=attach.call(this,o)};
    window.calls=[];window.holdOptions=false;window.optionReplies=[];window.invalid=false;
    window.chrome={runtime:{onMessage:{addListener:f=>window.control=f},sendMessage:m=>{
     calls.push(m);if(invalid)throw Error('Extension context invalidated.');
     if(m.action==='page-translation-options'){
      const reply={ok:true,currentChoice:'free',choices:[{id:'free',route:'free',label:'微软 · 免 Key'},{id:'bilibili',route:'bilibili',label:'B站'},{id:'tested-model',route:'model',label:'已测试模型'}]};
      return holdOptions?new Promise(resolve=>optionReplies.push(()=>resolve(reply))):Promise.resolve(reply);
     }
     if(m.action==='page-translation-switch')return Promise.resolve({ok:true,token:'new-token',route:'model',label:'已测试模型'});
     if(m.action==='page-translation-stop')return Promise.resolve({ok:true});
     if(pending&&m.token==='start')return new Promise(resolve=>window.finishOld=()=>resolve({ok:true,text:'旧译文'}));
     return Promise.resolve({ok:true,text:'译文 '+m.text});
    }}};
   },pending);
   await page.addScriptTag({path:'extension/page-translation.js'});
   await page.evaluate(()=>control({action:'page-translation-toggle',token:'start',route:'free',targetLanguage:'zh'},null,()=>{}));
  }
  const open=async()=>{
   assert.equal(await page.evaluate(()=>bar.querySelector('[data-action=choose-route]')?.tagName),'BUTTON','normal status must expose an accessible chooser button');
   await page.evaluate(()=>bar.querySelector('[data-action=choose-route]').click());
   await page.waitForFunction(()=>bar.querySelector('option[value=tested-model]')&&!bar.querySelector('select').disabled);
  };
  const choose=()=>page.evaluate(()=>{const s=bar.querySelector('select');s.value='tested-model';s.dispatchEvent(new Event('change'));});
  await setup();await page.waitForFunction(()=>document.querySelector('#done span')?.textContent.startsWith('译文'));
  await open();await choose();
  assert.equal(await page.evaluate(()=>calls.filter(m=>m.action==='page-translation-switch').length),0);
  assert.equal(await page.evaluate(()=>calls.filter(m=>m.action==='page-translation-text').length),1,'opening/selecting does not resend completed content');
  assert.match(await page.evaluate(()=>bar.querySelector('small').textContent),/API/);
  assert.equal(await page.evaluate(()=>bar.querySelector('select').options.length),3);
  await page.screenshot({path:'work/translation-picker.png'});
  await page.evaluate(()=>bar.querySelector('[data-action=cancel-route]').click());
  assert.equal(await page.evaluate(()=>bar.querySelector('.recovery').hidden),true);
  await page.evaluate(()=>{const p=document.createElement('p');p.id='after-cancel';p.textContent='After cancelling.';document.querySelector('main').append(p);});
  await page.waitForFunction(()=>document.querySelector('#after-cancel span')?.textContent.startsWith('译文'));
  assert.equal(await page.evaluate(()=>calls.find(m=>m.text==='After cancelling.').token),'start');
  // Native button keyboard activation and Escape work within the closed shadow root.
  await page.evaluate(()=>bar.querySelector('[data-action=choose-route]').focus());await page.keyboard.press('Enter');
  await page.waitForFunction(()=>!bar.querySelector('.recovery').hidden&&!bar.querySelector('select').disabled);
  await page.keyboard.press('Escape');
  assert.equal(await page.evaluate(()=>bar.querySelector('.recovery').hidden),true);
  assert.equal(await page.evaluate(()=>bar.activeElement?.dataset.action),'choose-route');
  await page.keyboard.press('Space');await page.waitForFunction(()=>!bar.querySelector('select').disabled);await choose();
  await page.evaluate(()=>bar.querySelector('[data-action=continue]').click());
  await page.waitForFunction(()=>bar.querySelector('.route').textContent==='已测试模型'&&bar.querySelector('.recovery').hidden);
  assert.equal(await page.evaluate(()=>calls.filter(m=>m.action==='page-translation-text').length),2,'applying preserves completed paragraphs');
  await page.evaluate(()=>{const p=document.createElement('p');p.id='new';p.textContent='New paragraph after apply.';document.querySelector('main').append(p);});
  await page.waitForFunction(()=>document.querySelector('#new span')?.textContent.startsWith('译文'));
  assert.equal(await page.evaluate(()=>calls.find(m=>m.text==='New paragraph after apply.').token),'new-token');
  assert.equal(await page.evaluate(()=>calls.find(m=>m.action==='page-translation-switch').choiceId),'tested-model');
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  console.log('PASS completed-state picker, tested model, explicit apply, cancel, keyboard and current-page future content');

  await setup(true);await page.waitForFunction(()=>!!window.finishOld);await open();await choose();
  assert.equal(await page.evaluate(()=>calls.filter(m=>m.action==='page-translation-text').length),1);
  await page.evaluate(()=>bar.querySelector('[data-action=continue]').click());
  await page.waitForFunction(()=>document.querySelector('#done span')?.textContent==='译文 First paragraph.');
  await page.evaluate(()=>finishOld());await page.waitForTimeout(50);
  assert.equal(await page.locator('#done span').textContent(),'译文 First paragraph.','late old-token result must not overwrite new translation');
  console.log('PASS apply restarts unfinished work without waiting for stale in-flight requests');

  await setup();await page.waitForFunction(()=>document.querySelector('#done span')?.textContent.startsWith('译文'));
  await page.evaluate(()=>{holdOptions=true;bar.querySelector('[data-action=choose-route]').click();});
  await page.waitForFunction(()=>optionReplies.length===1);
  await page.evaluate(()=>{bar.querySelector('[data-action=cancel-route]').click();bar.querySelector('[data-action=choose-route]').click();});
  await page.waitForFunction(()=>optionReplies.length===2);
  await page.evaluate(()=>optionReplies[1]());await page.waitForFunction(()=>!bar.querySelector('select').disabled);await choose();
  await page.evaluate(()=>optionReplies[0]());await page.waitForTimeout(50);
  assert.equal(await page.evaluate(()=>bar.querySelector('select').value),'tested-model','late menu response must not reset the current selection');
  await page.evaluate(()=>{bar.querySelector('[data-action=cancel-route]').click();invalid=true;bar.querySelector('[data-action=choose-route]').click();});
  await page.waitForFunction(()=>bar.querySelector('[role=alert]').textContent.includes('刷新'));
  assert.equal(await page.evaluate(()=>bar.querySelector('select').checkVisibility()),false);
  assert.deepEqual(errors,[]);
  console.log('PASS cancelled options race and invalidated-context refresh guidance');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
