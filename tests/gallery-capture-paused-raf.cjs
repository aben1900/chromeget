const assert=require('node:assert/strict');
const {chromium}=require('playwright');

(async()=>{
 const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
 try{
  const page=await browser.newPage({viewport:{width:500,height:400}});
  await page.setContent('<body style="min-height:1200px">Long page</body>');
  await page.addScriptTag({path:'extension/gallery-capture.js'});
  const png='data:image/png;base64,'+(await page.screenshot()).toString('base64');
  await page.evaluate(png=>{
   window.captureResult=null;
   window.chrome={permissions:{request:async()=>true},tabs:{query:async()=>[{id:1,windowId:2,url:'https://example.com/',active:true}],get:async()=>({id:1,windowId:2,url:'https://example.com/',active:true}),captureVisibleTab:async()=>png},scripting:{executeScript:async spec=>{
    if(spec.func.name==='longSession'){window.lastCaptureAction=spec.args[0];if(spec.args[0]==='hide')window.requestAnimationFrame=()=>0}
    return [{documentId:'doc',result:await spec.func(...(spec.args||[]))}];
   }}};
   const nativeAttach=Element.prototype.attachShadow;
   Element.prototype.attachShadow=function(options){const root=nativeAttach.call(this,options);window.captureShadow=root;return root};
   GalleryCapture.capture(2).then(result=>captureResult=result,error=>captureResult={error:error.message});
  },png);
  await page.locator('[data-chromeget-capture]').waitFor({state:'attached'});
  await page.mouse.move(30,30);await page.mouse.down();await page.mouse.move(230,230);await page.mouse.up();
  await page.evaluate(()=>captureShadow.querySelector('[aria-label="滚动长截图"]').click());
  await page.waitForFunction(()=>lastCaptureAction==='hide',null,{timeout:5000});
  await page.waitForTimeout(9000);
  assert.notEqual(await page.evaluate(()=>captureResult),null,'capture remains pending when animation frames pause');
  assert.equal(await page.evaluate(()=>captureResult.error||''),'');
  assert.ok(await page.evaluate(()=>captureResult.height>200));
  assert.equal(await page.locator('[data-chromeget-long-capture]').count(),0);
  console.log('PASS long screenshot completes when requestAnimationFrame is paused');
 }finally{await browser.close()}
})().catch(error=>{console.error(error);process.exitCode=1});
