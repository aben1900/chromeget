const assert=require('assert/strict'),{chromium}=require('playwright');

(async()=>{
 const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
 try{
  const page=await browser.newPage();
  await page.setContent('<button data-model-settings>模型设置</button><button data-translation>比对翻译</button>');
  await page.evaluate(()=>{
   window.calls=[];window.rendered=[];
   window.OverlayWindowRender=(...args)=>rendered.push(args);
   window.chrome={runtime:{sendMessage:async message=>{calls.push(message);return {ok:true,render:{url:'chrome-extension://fixture/'+message.tool+'.html?overlay=token',token:'token',tool:message.tool,title:message.tool}}}},windows:{create:()=>{throw Error('must not create an external window')}}};
  });
  await page.addScriptTag({path:'extension/model-navigation.js'});
  await page.locator('[data-model-settings]').click();
  await page.locator('[data-translation]').click();
  assert.deepEqual(await page.evaluate(()=>calls),[{action:'open-tool-overlay',tool:'model'},{action:'open-tool-overlay',tool:'translate'}]);
  assert.deepEqual(await page.evaluate(()=>rendered.map(x=>x[2])),['model','translate']);
  assert.equal(await page.locator('[data-model-settings]').isEnabled(),true);
  assert.equal(await page.locator('[data-translation]').isEnabled(),true);
  console.log('PASS model and translation open inside browser without standalone windows');
 }finally{await browser.close()}
})().catch(error=>{console.error(error);process.exitCode=1});
