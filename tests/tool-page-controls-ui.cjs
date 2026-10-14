const assert=require('assert/strict'),{chromium}=require('playwright');

(async()=>{
 const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
 try{
  const page=await browser.newPage();
  await page.setContent('<title>模型设置 · 精彩摘录</title><main><h1>模型设置</h1></main>');
  await page.evaluate(()=>{window.closedTab=0;window.chrome={tabs:{getCurrent:async()=>({id:5}),remove:async()=>{closedTab++}}}});
  await page.addStyleTag({path:'extension/tool-page.css'});
  await page.addScriptTag({path:'extension/tool-page.js'});
  await page.addScriptTag({path:'extension/window-controls.js'});
  const detailIcons=await page.evaluate(()=>{
   const detail=document.createElement('dialog'),bar=document.createElement('div');
   bar.append(document.createElement('button'));
   detail.append(bar);document.body.append(detail);
   WindowControls.maximize(detail,bar);
   const button=bar.querySelector('.window-maximize'),normal=button.querySelector('svg').outerHTML;
   button.click();
   const maximized=button.querySelector('svg').outerHTML;
   detail.remove();
   return {normal,maximized};
  });
  assert.equal(await page.locator('.tool-page-header').count(),1);
  const maximize=page.locator('.tool-page-header [data-tool-fullscreen]');
  assert.equal(await maximize.locator('svg').evaluate(svg=>svg.outerHTML),detailIcons.normal,'use the record-detail maximize icon');
  assert.equal(await maximize.getAttribute('aria-label'),'最大化');
  await page.evaluate(()=>{
   window.fakeFullscreen=false;
   Object.defineProperty(document,'fullscreenElement',{configurable:true,get:()=>window.fakeFullscreen?document.documentElement:null});
   document.documentElement.requestFullscreen=async()=>{window.fakeFullscreen=true;document.dispatchEvent(new Event('fullscreenchange'))};
   document.exitFullscreen=async()=>{window.fakeFullscreen=false;document.dispatchEvent(new Event('fullscreenchange'))};
  });
  await maximize.click();
  assert.equal(await maximize.locator('svg').evaluate(svg=>svg.outerHTML),detailIcons.maximized,'use the record-detail restore icon');
  assert.equal(await maximize.getAttribute('aria-label'),'恢复窗口');
  await maximize.click();
  assert.equal(await maximize.locator('svg').evaluate(svg=>svg.outerHTML),detailIcons.normal);
  assert.equal(await maximize.getAttribute('aria-label'),'最大化');
  await page.locator('[data-tool-close]').click();
  assert.equal(await page.evaluate(()=>closedTab),1);
  const frame=await page.evaluateHandle(()=>{const iframe=document.createElement('iframe');iframe.srcdoc='<title>模型设置 · 精彩摘录</title><main><h1>模型设置</h1></main>';document.body.append(iframe);return iframe});
  const embedded=await frame.asElement().contentFrame();
  await embedded.locator('body').waitFor();
  await embedded.addScriptTag({path:'extension/tool-page.js'});
  assert.equal(await embedded.locator('.tool-page-header').count(),0);
  assert.equal(await embedded.locator('html').getAttribute('data-tool-embedded'),'true');
  console.log('PASS fallback tab has in-page fullscreen/close icons; embedded tool uses parent controls');
 }finally{await browser.close()}
})().catch(error=>{console.error(error);process.exitCode=1});
