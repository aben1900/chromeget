const fs=require('fs'),assert=require('assert/strict'),{chromium}=require('playwright');

(async()=>{
 const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
 try{
  const page=await browser.newPage(),errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.setContent(fs.readFileSync('extension/library.html','utf8').replace(/<script[^>]*>[\s\S]*?<\/script>/g,'').replace(/<link[^>]*>/g,''));
  for(const file of ['library.css','theme.css','model-navigation.css'])await page.addStyleTag({path:'extension/'+file});
  await page.evaluate(()=>{
   window.calls=[];
   window.profile={profileId:'p',label:'我的服务',hasKey:true,revision:'r',model:'gpt-4.1',models:[{id:'gpt-4.1',label:'默认',lastTest:{ok:true,revision:'r'}},{id:'gpt-4.1-mini',label:'轻量',lastTest:{ok:true,revision:'r'}},{id:'bad',label:'未测试'}]};
   window.chrome={
    runtime:{sendMessage:async message=>{
     calls.push(message);
     if(message.action==='ai-settings-get')return {ok:true,profiles:{p:profile},defaultProfileId:'p'};
     if(message.action==='ai-generate')return {ok:true,requestId:'r',recordId:'clip:1',state:'completed',text:'测试摘要'};
     if(message.action==='ai-prepare')return {ok:true,requestId:'r',recordId:message.id,characters:20,profile:{label:'我的服务',model:message.model,baseUrl:'https://example.test'}};
     return {ok:true,requests:[]};
    }},
    storage:{onChanged:{addListener:fn=>window.changed=fn},local:{get:async()=>({}),set:async()=>{}}},
    windows:{create:()=>{throw Error('standalone windows are not allowed')}}
   };
  });
  for(const file of ['library-ai-api.js','library-ai-view.js','library-ai-client.js','library-ai.js','model-navigation.js'])await page.addScriptTag({path:'extension/'+file});
  await page.waitForFunction(()=>!document.getElementById('aiSummaryChoice').disabled);
  await page.evaluate(()=>{
   document.getElementById('detail').hidden=false;
   document.getElementById('detail').showModal();
   window.dispatchEvent(new CustomEvent('library-detail',{detail:{id:'clip:1',type:'内容'}}));
  });
  assert.equal(await page.locator('#aiSummaryChoice option').count(),3);
  await page.selectOption('#aiSummaryChoice',JSON.stringify(['p','gpt-4.1-mini']));
  await page.click('#aiGenerate');
  await page.waitForFunction(()=>document.getElementById('aiText').value==='测试摘要');
  assert.equal(await page.evaluate(()=>calls.find(x=>x.action==='ai-prepare').temporary),true);
  assert.equal(await page.evaluate(()=>calls.some(x=>x.action==='ai-default-set')),false);
  await page.selectOption('#aiSummaryChoice','');
  assert.equal(await page.locator('#aiGenerate').isVisible(),true);
  await page.locator('[data-model-settings]').click();
  await page.locator('[data-model-settings]').click();
  assert.equal(await page.evaluate(()=>calls.filter(x=>x.action==='open-tool-overlay'&&x.tool==='model').length),2);
  await page.evaluate(()=>{profile.models=profile.models.slice(0,1);changed({aiSettingsUpdated:{newValue:1}},'local')});
  await page.waitForFunction(()=>document.querySelectorAll('#aiSummaryChoice option').length===2);
  for(const width of [390,1200]){
   await page.setViewportSize({width,height:950});
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  }
  assert.deepEqual(errors,[]);
  console.log('PASS in-browser model overlay, temporary model selection, direct summary generation and live settings refresh');
 }finally{await browser.close()}
})().catch(error=>{console.error(error);process.exitCode=1});
