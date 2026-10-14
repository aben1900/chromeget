const fs=require('fs'),assert=require('assert/strict'),vm=require('vm'),{chromium}=require('playwright');

(async()=>{
 let injected,popupCount=0;
 const context=vm.createContext({chrome:{runtime:{getURL:path=>'https://extension.test/'+path},windows:{getCurrent:async()=>({id:1}),create:async()=>{popupCount++}},tabs:{query:async()=>[{id:5}]},scripting:{executeScript:async value=>{injected=value;return [{result:true}]}}},crypto:{randomUUID:()=> 'test-token'},window:{}});
 vm.runInContext(fs.readFileSync('extension/window-overlay.js','utf8'),context);
 vm.runInContext(fs.readFileSync('extension/connection-review.js','utf8'),context);
 assert.equal(await context.window.ConnectionReview.open(),true);
 assert.equal(popupCount,0,'connection never creates an external Chrome window');
 assert.equal(injected.func.name,'OverlayWindowRender');

 const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
 try{
  const page=await browser.newPage({viewport:{width:1200,height:850}}),errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.route('https://website.test/**',route=>route.fulfill({body:'<body><h1>Website content</h1></body>',contentType:'text/html'}));
  await page.route('https://extension.test/**',route=>{
   const name=new URL(route.request().url()).pathname.slice(1),path='extension/'+name;
   if(!/^[\w.-]+$/.test(name)||!fs.existsSync(path))return route.abort();
   return route.fulfill({body:fs.readFileSync(path),contentType:name.endsWith('.css')?'text/css':name.endsWith('.js')?'text/javascript':'text/html'});
  });
  await page.addInitScript(()=>{window.chrome={runtime:{id:'a'.repeat(32),getManifest:()=>({version:'1.39.0'}),sendMessage:async()=>({connected:true,hostVersion:'1.39.0',diskExtensionVersion:'1.39.0',engineVersions:{node:'24.14.0','yt-dlp':'2026.08.19',aria2:'1.37.0',ffmpeg:'9.0.2'},storageFormat:'json',capabilities:['bookmark-metadata-v1','capture-ocr-v1','capture-save-v1','ai-vision-test-v1'],checks:[{id:'directory',state:'pass'},{id:'engines',state:'pass'}]})},storage:{local:{get:async()=>({pending:[]})},onChanged:{addListener(){}}},tabs:{create:async()=>{}}}});
  await page.goto('https://website.test/');
  await page.evaluate(()=>{const attach=Element.prototype.attachShadow;Element.prototype.attachShadow=function(options){return attach.call(this,{...options,mode:'open'})}});
  await page.evaluate(new Function('args',`return (${injected.func.toString()})(...args)`),injected.args);
  const frame=page.frameLocator('iframe[title="判定可用"]');
  await frame.locator('#connectionConclusion').waitFor();
  assert.equal(await frame.locator('#connectionConclusion').innerText(),'可以使用');
  assert.equal(await frame.locator('#connectionTitle').count(),0,'single title belongs to overlay chrome');
  assert.equal(await frame.locator('[data-close-dialog="connectionDialog"]').count(),0,'single close control belongs to overlay chrome');
  await page.waitForTimeout(100);
  const getDialog=()=>page.locator('[data-chromeget-connection-review]').evaluate(host=>host.shadowRoot.querySelector('dialog').getBoundingClientRect().toJSON());
  const box=await getDialog();
  assert.ok(Math.abs(box.x+box.width/2-600)<2&&Math.abs(box.y+box.height/2-425)<2,'overlay centered in page');
  assert.ok(box.width>=800&&box.height<830,'overlay should match content');
  await page.locator('[data-chromeget-connection-review]').evaluate(host=>host.shadowRoot.querySelector('[data-overlay-fullscreen]').click());
  const full=await getDialog();
  assert.equal(Math.round(full.width),1200,'fullscreen fills browser viewport');
  assert.equal(Math.round(full.height),850);
  assert.equal(await page.locator('[data-chromeget-connection-review]').evaluate(host=>host.shadowRoot.querySelector('[data-overlay-fullscreen]').getAttribute('aria-pressed')),'true');
  await page.locator('[data-chromeget-connection-review]').evaluate(host=>host.shadowRoot.querySelector('[data-overlay-fullscreen]').click());
  await page.setViewportSize({width:900,height:500});
  const resized=await getDialog();
  assert.ok(resized.top>=0&&resized.bottom<=500,'overlay stays inside resized browser viewport');
  await frame.locator('#checkConnection').focus();
  await page.keyboard.press('Escape');
  await page.waitForFunction(()=>!document.querySelector('[data-chromeget-connection-review]'));
  assert.deepEqual(errors,[]);
  console.log('PASS connection overlay centered, single header, fullscreen, resize and Escape without external window');
 }finally{await browser.close()}
})().catch(error=>{console.error(error);process.exitCode=1});
