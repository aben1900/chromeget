const fs=require('fs'),assert=require('assert/strict'),{chromium}=require('playwright');

(async()=>{
 const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
 try{
  const page=await browser.newPage({viewport:{width:390,height:850}});
  const html=fs.readFileSync('extension/app.html','utf8').replace(/<script[\s\S]*?<\/script>/g,'').replace(/<link[^>]*>/g,'');
  await page.setContent(html);
  await page.evaluate(()=>{
   window.reviewCalls=0;
   window.ConnectionReview={open:()=>{reviewCalls++;return new Promise(resolve=>window.finishReview=resolve)}};
   window.chrome={storage:{onChanged:{addListener(){}}},scripting:{executeScript(){throw Error('unexpected injection')}}};
  });
  await page.addScriptTag({path:'extension/home-tools.js'});
  await page.locator('#connectionToggle').evaluate(button=>{button.click();button.click()});
  assert.equal(await page.evaluate(()=>reviewCalls),1,'two clicks while opening invoke only one overlay');
  assert.equal(await page.locator('#connectionDialog').evaluate(dialog=>dialog.open),false);
  await page.evaluate(()=>finishReview(false));
  await page.waitForFunction(()=>document.getElementById('connectionDialog').open);
  await page.locator('[data-close-dialog="connectionDialog"]').click();
  await page.locator('#connectionToggle').click();
  assert.equal(await page.evaluate(()=>reviewCalls),2,'opening guard clears after fallback');
  await page.evaluate(()=>finishReview(true));
  await page.waitForFunction(()=>!document.getElementById('connectionToggle').disabled);
  assert.equal(await page.locator('#connectionDialog').evaluate(dialog=>dialog.open),false,'successful browser overlay does not duplicate the local dialog');
  console.log('PASS connection opening guard and local dialog fallback without a Chrome window');
 }finally{await browser.close()}
})().catch(error=>{console.error(error);process.exitCode=1});
