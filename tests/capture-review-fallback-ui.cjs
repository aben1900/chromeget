const fs=require('fs'),assert=require('assert/strict'),{chromium}=require('playwright');

(async()=>{
 const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
 try{
  const page=await browser.newPage(),html=fs.readFileSync('extension/ocr-review.html','utf8').replace(/<script[^>]*><\/script>/g,'');
  await page.route('https://extension.test/**',route=>route.fulfill({body:html,contentType:'text/html'}));
  await page.goto('https://extension.test/ocr-review.html?token=review-1&originWindowId=7');
  await page.evaluate(()=>{
   window.focusCalls=[];
   window.chrome={windows:{getCurrent:async()=>({id:8}),update:async id=>{focusCalls.push(id);return {id}}},runtime:{sendMessage:async()=>({ok:true,text:'recognized'})},storage:{onChanged:{addListener(){}}}};
   window.GalleryCapture={capture:async(id,options,before)=>{if(before)await before();return {cancelled:true}}};
  });
  await page.addScriptTag({path:'extension/collect-model.js'});
  await page.addScriptTag({path:'extension/prompt-title.js'});
  await page.addScriptTag({path:'extension/content-capture.js'});
  await page.locator('#captureContent').click();
  await page.waitForFunction(()=>document.querySelector('#ocrStatus').textContent.includes('已取消截图'));
  assert.deepEqual(await page.evaluate(()=>focusCalls),[7,8],'show the original page for selection, then return to the OCR review popup');
  console.log('PASS OCR fallback popup focuses the source window for reselection and restores itself afterward');
 }finally{await browser.close()}
})().catch(error=>{console.error(error);process.exitCode=1});
