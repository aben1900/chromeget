const fs=require('fs'),assert=require('assert/strict'),{chromium}=require('playwright');
(async()=>{
 const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
 try{
  const page=await browser.newPage();
  let queries=0;
  const calls=[];
  await page.exposeFunction('request',message=>{
   calls.push(message.action);
   if(message.action==='library-query'){
    queries++;
    return {ok:true,items:[
     {id:'clip:1',type:'内容',title:'有摘要',summaryPreview:'三行摘要\n'.repeat(20),summaryTruncated:true,aiSummaryStale:true,preview:'原文片段',tags:[],collections:[]},
     {id:'clip:2',type:'内容',title:'无摘要',preview:'正文',tags:[],collections:[]}
    ],total:2,revision:'r',facets:{types:[],sources:[],tags:[],collections:[]}};
   }
   if(message.action==='ai-read')return {ok:true,summary:{text:'<img src=x onerror=alert(1)>完整摘要'}};
   return {ok:true,items:[]};
  });
  await page.setContent(fs.readFileSync('extension/library.html','utf8').replace(/<script[^>]*>[\s\S]*?<\/script>/g,'').replace(/<link[^>]*>/g,''));
  await page.addStyleTag({path:'extension/library.css'});
  await page.evaluate(()=>{window.chrome={runtime:{sendMessage:window.request}}});
  await page.addScriptTag({path:'extension/library-model.js'});
  await page.addScriptTag({path:'extension/library.js'});
  await page.waitForSelector('.card-summary.collapsible');
  assert.equal(await page.locator('.item').nth(1).locator('.card-summary').count(),0);
  assert.equal(await page.locator('.item').nth(1).locator('.item-preview').textContent(),'正文');
  assert.equal(calls.includes('ai-read'),false);
  await page.click('.card-summary');
  await page.waitForFunction(()=>document.querySelector('.card-summary-text')?.textContent.includes('完整摘要'));
  assert.equal(await page.locator('.card-summary img').count(),0);
  assert.equal(await page.locator('.card-summary').getAttribute('aria-expanded'),'true');
  assert.match(await page.locator('.card-summary strong').textContent(),/请核对/);
  await page.click('.card-summary');
  assert.equal(await page.locator('.card-summary').getAttribute('aria-expanded'),'false');
  const before=queries;
  await page.evaluate(()=>window.dispatchEvent(new CustomEvent('library-summary-saved')));
  await page.waitForFunction(()=>document.querySelector('.card-summary-text')?.textContent.includes('三行摘要'));
  assert.ok(queries>before);
  assert.ok(!calls.some(action=>action==='ai-generate'));
  await page.setViewportSize({width:390,height:900});
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  console.log('PASS card preview, lazy expansion, safe text, collapse, save refresh and no generation');
 }finally{await browser.close()}
})().catch(error=>{console.error(error);process.exitCode=1});