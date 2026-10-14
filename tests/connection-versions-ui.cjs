const fs=require('fs'),assert=require('assert/strict'),{chromium}=require('playwright');
(async()=>{const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});try{
 const page=await browser.newPage({viewport:{width:560,height:850}});
 await page.setContent(fs.readFileSync('extension/app.html','utf8').replace(/<script[\s\S]*?<\/script>/g,'').replace(/<link[^>]*>/g,''));
 for(const file of ['app.css','theme.css','home-tools.css','connection.css'])await page.addStyleTag({path:'extension/'+file});
 await page.evaluate(()=>{window.chrome={runtime:{id:'a'.repeat(32),getManifest:()=>({version:'1.39.0'}),sendMessage:async()=>({connected:true,hostVersion:'1.39.0',diskExtensionVersion:'1.39.0',engineVersions:{node:'24.14.0','yt-dlp':'2026.08.19',aria2:'1.37.0',ffmpeg:'9.0.2'},storageFormat:'json',capabilities:['bookmark-metadata-v1','capture-ocr-v1','capture-save-v1','ai-vision-test-v1'],checks:[{id:'directory',state:'pass'},{id:'engines',state:'pass'}]})},storage:{local:{get:async()=>({pending:[]})},onChanged:{addListener(){}}},tabs:{create:async()=>{}}}});
 await page.addScriptTag({path:'extension/connection.js'});await page.waitForFunction(()=>document.querySelector('#connectionConclusion').textContent==='可以使用');await page.locator('#connectionDialog').evaluate(e=>e.showModal());
 const visible=await page.locator('#connectionDialog').innerText();for(const label of ['扩展','本地程序','Node','yt-dlp','aria2','FFmpeg'])assert.ok(visible.includes(label),label+' absent');for(const version of ['1.39.0','24.14.0','2026.08.19','1.37.0','9.0.2'])assert.ok(visible.includes(version),version+' absent');
 assert.equal(await page.locator('#checkDetails').evaluate(e=>e.open),false);
 console.log('PASS visible component versions');
}finally{await browser.close()}})().catch(e=>{console.error(e);process.exitCode=1});
