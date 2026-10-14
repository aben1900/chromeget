const fs=require('fs'),assert=require('assert/strict'),{chromium}=require('playwright');

(async()=>{
 const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
 try{
  const page=await browser.newPage({viewport:{width:1200,height:850}}),errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.goto('about:blank');
  await page.evaluate(()=>{
   const attach=Element.prototype.attachShadow;
   Element.prototype.attachShadow=function(options){return attach.call(this,{...options,mode:'open'})};
   window.closedTokens=[];
   window.chrome={runtime:{sendMessage:async message=>closedTokens.push(message)}};
  });
  await page.addScriptTag({path:'extension/window-overlay.js'});
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
  await page.evaluate(()=>OverlayWindowRender('about:blank','first','connection','判定可用'));
  const host=page.locator('[data-chromeget-tool-overlay="connection"]');
  assert.equal(await host.count(),1);
  const button=host.locator('button[data-overlay-fullscreen]');
  assert.equal(await button.locator('svg').evaluate(svg=>svg.outerHTML),detailIcons.normal,'use the record-detail maximize icon');
  assert.equal(await button.getAttribute('aria-label'),'最大化');
  let box=await host.evaluate(node=>node.shadowRoot.querySelector('dialog').getBoundingClientRect().toJSON());
  assert.ok(Math.abs(box.x+box.width/2-600)<2);
  assert.ok(Math.abs(box.y+box.height/2-425)<2);
  await button.click();
  assert.equal(await button.locator('svg').evaluate(svg=>svg.outerHTML),detailIcons.maximized,'use the record-detail restore icon');
  assert.equal(await button.getAttribute('aria-label'),'恢复窗口');
  box=await host.evaluate(node=>node.shadowRoot.querySelector('dialog').getBoundingClientRect().toJSON());
  assert.ok(box.width>=1198&&box.height>=848,'fullscreen should fill the browser viewport');
  await button.click();
  assert.equal(await button.locator('svg').evaluate(svg=>svg.outerHTML),detailIcons.normal);
  assert.equal(await button.getAttribute('aria-label'),'最大化');
  await page.evaluate(()=>OverlayWindowRender('about:blank','second','connection','判定可用'));
  assert.equal(await page.locator('[data-chromeget-tool-overlay="connection"]').count(),1,'a second open should replace the old overlay');
  await page.evaluate(()=>OverlayWindowRender('about:blank','model-token','model','模型设置'));
  assert.equal(await page.locator('[data-chromeget-tool-overlay]').count(),2,'a model overlay can stack above the first tool');
  const model=page.locator('[data-chromeget-tool-overlay="model"]');
  await model.locator('button[data-overlay-close]').click();
  assert.equal(await model.count(),0);
  assert.deepEqual(await page.evaluate(()=>closedTokens.map(x=>x.token)),['model-token']);
  await page.keyboard.press('Escape');
  assert.equal(await host.count(),0);
  assert.deepEqual(errors,[]);
  console.log('PASS browser tool overlay fullscreen, restore, close and deduplication');
 }finally{await browser.close()}
})().catch(error=>{console.error(error);process.exitCode=1});
