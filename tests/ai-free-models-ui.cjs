'use strict';
const fs=require('fs'),assert=require('assert/strict'),{chromium}=require('playwright');
(async()=>{
 const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
 try{
  const page=await browser.newPage({viewport:{width:1100,height:950}});page.setDefaultTimeout(5000);const sent=[],errors=[];page.on('pageerror',e=>errors.push(e.message));
  const original={profileId:'original',label:'已有默认模型',provider:'deepseek',protocol:'chat-completions',baseUrl:'https://api.deepseek.com',auth:'bearer',model:'deepseek-flash',models:[{id:'deepseek-flash',label:'DeepSeek',lastTest:{ok:true,revision:'1'}}],hasKey:true,revision:'1',lastTest:{ok:true,revision:'1'}};
  const settings={ok:true,profiles:{original},defaultProfileId:'original',selectionRevision:'s',importsCompleted:true};
  await page.exposeFunction('request',m=>{sent.push(m);if(m.action==='ai-test-draft')return {ok:true,testReceipt:'receipt-'+m.draft.model};if(m.action==='ai-settings-save'){
   const {key,testReceipts,...draft}=m,id=m.profileId||'saved',revision='2';const old=settings.profiles[id];settings.profiles[id]={...draft,profileId:id,revision,hasKey:!!key||!!old?.hasKey,models:m.models.map(model=>({...model,...(testReceipts.includes('receipt-'+model.id)?{lastTest:{ok:true,revision}}:{})}))};return {...settings,profileId:id};
  }return settings;});
  await page.setContent(fs.readFileSync('extension/model-settings.html','utf8').replace(/<script[^>]*>[\s\S]*?<\/script>/g,'').replace(/<link[^>]*>/g,''));
  for(const file of ['library.css','theme.css','model-navigation.css'])await page.addStyleTag({path:'extension/'+file});
  await page.evaluate(()=>{window.chrome={runtime:{sendMessage:m=>window.request(m)},storage:{local:{get:async()=>({}),set:async()=>{}}}}});
  for(const file of ['library-ai-api.js','library-ai-view.js','library-ai-settings.js'])await page.addScriptTag({path:'extension/'+file});
  const quick=id=>page.locator('[data-free-preset="'+id+'"]');
  await quick('zhipu-free').click();
  assert.equal(await page.inputValue('#aiBaseUrl'),'https://open.bigmodel.cn/api/paas/v4');
  assert.equal(await page.inputValue('#aiModel'),'glm-4-flash-250414');
  assert.equal(await page.locator('#aiModelsEditor .catalog-entry').count(),2);
  assert.equal(await page.locator('#aiPresetKeyLink').getAttribute('href'),'https://bigmodel.cn/usercenter/proj-mgmt/apikeys');
  assert.equal(sent.some(m=>m.action!=='ai-settings-get'),false,'opening preset must not save or call API');
  for(const width of [320,390,1100]){await page.setViewportSize({width,height:950});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'overflow '+width);}
  await page.setViewportSize({width:1100,height:950});await page.screenshot({path:'work/free-model-preset.png',fullPage:true});
  await page.fill('#aiKey','fixture-only');await page.click('#aiTest');await page.waitForFunction(()=>document.getElementById('aiDialogStatus').textContent.includes('成功'));
  assert.equal(sent.at(-1).draft.provider,'custom');
  await page.selectOption('#aiProvider','siliconflow-free');assert.equal(await page.inputValue('#aiKey'),'');
  assert.equal(await page.inputValue('#aiLabel'),'硅基流动 · 免费模型');
  assert.equal(await page.inputValue('#aiModel'),'THUDM/GLM-4-9B-0414');
  await page.fill('#aiKey','fixture-sf');await page.click('#aiTest');await page.waitForFunction(()=>document.getElementById('aiDialogStatus').textContent.includes('成功'));
  await page.click('#aiSaveSettings');await page.waitForSelector('#aiModelDialog:not([open])',{state:'attached'});
  const saved=sent.findLast(m=>m.action==='ai-settings-save');assert.deepEqual(saved.testReceipts,['receipt-THUDM/GLM-4-9B-0414']);
  assert.equal(saved.provider,'custom');assert.equal(settings.defaultProfileId,'original');assert.equal(await page.inputValue('#aiKey'),'');
  assert.equal(await page.locator('#aiDefaultModel option[data-passed]').count(),2,'tested free model becomes selectable alongside existing default');
  await quick('siliconflow-free').click();assert.match(await page.textContent('#aiKeyState'),/已保存/);await page.click('#aiSaveSettings');await page.waitForSelector('#aiModelDialog:not([open])',{state:'attached'});
  assert.equal(sent.at(-1).profileId,'saved','existing free profile is reused');assert.ok(!('key' in sent.at(-1)),'saved key is preserved, not exposed');assert.equal(Object.keys(settings.profiles).length,2);
  // Mixed paid/free profiles must not be silently reused as a free preset.
  settings.profiles.saved.models.push({id:'Pro/paid-model',label:'paid'});await page.click('#aiReconnect');await quick('siliconflow-free').click();assert.equal(await page.textContent('#aiDialogTitle'),'添加配置');
  await page.fill('#aiBaseUrl','https://example.test/v1');assert.equal(await page.locator('#aiPresetInfo').isVisible(),false);await page.click('#aiCancelDialog');
  assert.deepEqual(errors,[]);assert.equal(sent.some(m=>m.action==='ai-default-set'),false);
  console.log('PASS free presets UI: no automatic calls, responsive layout, key isolation, test/save, default preservation, deduplication and mixed-profile isolation');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
