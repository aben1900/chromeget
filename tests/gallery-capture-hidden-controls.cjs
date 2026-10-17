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
   window.captureResult=null;window.captureCalls=0;
   window.chrome={permissions:{request:async()=>true},tabs:{query:async()=>[{id:1,windowId:2,url:'https://example.com/',active:true}],get:async()=>({id:1,windowId:2,url:'https://example.com/',active:true}),captureVisibleTab:async()=>{if(++captureCalls===2){window.captureBlocked=true;await new Promise(resolve=>window.releaseCapture=resolve)}return png}},scripting:{executeScript:async spec=>[{documentId:'doc',result:await spec.func(...(spec.args||[]))}]}};
   const attach=Element.prototype.attachShadow;Element.prototype.attachShadow=function(options){const root=attach.call(this,options);window.captureShadow=root;return root};
   GalleryCapture.capture(2).then(result=>captureResult=result,error=>captureResult={error:error.message});
  },png);
  async function selectLong(){
   await page.locator('[data-chromeget-capture]').waitFor({state:'attached'});
   await page.mouse.move(30,30);await page.mouse.down();await page.mouse.move(230,230);await page.mouse.up();
   await page.evaluate(()=>captureShadow.querySelector('[aria-label="滚动长截图"]').click());
   await page.waitForFunction(()=>window.captureBlocked===true,null,{timeout:10000});
  }
  async function clickHidden(selector){
   const point=await page.evaluate(selector=>{const r=captureShadow.querySelector(selector).getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2,visibility:document.querySelector('[data-chromeget-long-capture]').style.visibility}},selector);
   assert.equal(point.visibility,'hidden','test must click while the capture overlay is temporarily hidden');
   await page.mouse.click(point.x,point.y);
  }
  await selectLong();await clickHidden('.tools button:last-child');await page.evaluate(()=>releaseCapture());
  await page.waitForFunction(()=>window.captureResult!==null,null,{timeout:5000});
  assert.equal(await page.evaluate(()=>captureResult.cancelled),true,'Cancel should remain clickable during a frame capture');

  await page.evaluate(()=>{window.captureResult=null;window.captureBlocked=false;window.captureCalls=0;window.releaseCapture=null;scrollTo(0,0);GalleryCapture.capture(2).then(result=>captureResult=result,error=>captureResult={error:error.message})});
  await selectLong();await clickHidden('.done');await page.evaluate(()=>releaseCapture());
  await page.waitForFunction(()=>window.captureResult!==null,null,{timeout:5000});
  assert.equal(await page.evaluate(()=>captureResult.error||''),'');
  assert.ok(await page.evaluate(()=>captureResult.height>=200));
  assert.equal(await page.locator('[data-chromeget-long-capture]').count(),0);
  console.log('PASS cancel and finish controls remain responsive during hidden capture frames');
 }finally{await browser.close()}
})().catch(error=>{console.error(error);process.exitCode=1});
