const fs=require('node:fs'),assert=require('node:assert/strict'),{chromium}=require('playwright');
(async()=>{const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});try{
 const page=await browser.newPage();await page.setContent(fs.readFileSync('extension/popup.html','utf8').replace(/<script[\s\S]*?<\/script>/g,''));
 await page.evaluate(()=>{window.calls=[];window.chrome={windows:{getCurrent:async()=>({id:1})},runtime:{sendMessage:async message=>{if(message.action==='capture-ocr'){calls.push(message);return {ok:true,text:calls.length===1?'第一行\n重复行':'重复行\n第二行'}}return {ok:true,records:[],total:0,journalPath:'F:/摘录数据.json'}}}};window.GalleryCapture={capture:async()=>{const canvas=document.createElement('canvas');canvas.width=100;canvas.height=2500;canvas.getContext('2d').fillRect(0,0,100,2500);return {png:canvas.toDataURL('image/png'),long:true,sourceUrl:'https://example.com'}}};});
 for(const file of ['collect-model.js','prompt-title.js','ocr-tiles.js','content-capture.js'])await page.addScriptTag({path:'extension/'+file});
 await page.click('#captureContent');await page.waitForFunction(()=>document.querySelector('#ocrText').value.includes('第二行'));
 assert.equal(await page.locator('#ocrText').inputValue(),'第一行\n重复行\n第二行');assert.equal(await page.evaluate(()=>calls.length),2);
 assert.equal(await page.locator('#ocrImage').getAttribute('src').then(src=>src.startsWith('data:image/png;base64,')),true);
 console.log('PASS long screenshot OCR processes bounded tiles and retains full stitched preview');
}finally{await browser.close()}})().catch(error=>{console.error(error);process.exitCode=1});
