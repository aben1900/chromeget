const fs=require('fs'),assert=require('assert/strict'),{chromium}=require('playwright');

(async()=>{
 const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
 try{
  const page=await browser.newPage({viewport:{width:1200,height:850}});
  await page.route('https://website.test/**',route=>route.fulfill({contentType:'text/html',body:'<iframe src="https://extension.test/connection-window.html?token=fixture" style="width:1120px;height:760px"></iframe>'}));
  await page.route('https://extension.test/**',route=>{
   const name=new URL(route.request().url()).pathname.slice(1),path='extension/'+name;
   if(!/^[\w.-]+$/.test(name)||!fs.existsSync(path))return route.abort();
   return route.fulfill({body:fs.readFileSync(path),contentType:name.endsWith('.css')?'text/css':name.endsWith('.js')?'text/javascript':'text/html'});
  });
  await page.addInitScript(()=>{window.chrome={runtime:{id:'a'.repeat(32),getManifest:()=>({version:'1.39.0'}),sendMessage:async()=>({connected:true,storageFormat:'json',checks:[{id:'directory',state:'pass'}]})},storage:{local:{get:async()=>({pending:[]})},onChanged:{addListener(){}}},tabs:{create:async()=>{}}}});
  await page.goto('https://website.test/');
  const frame=page.frameLocator('iframe');
  await frame.locator('#connectionConclusion').waitFor();
  assert.equal(await frame.locator('[data-close-dialog="connectionDialog"]').count(),0,'overlay owns the sole close icon');
  assert.equal(await frame.locator('#connectionTitle').count(),0,'overlay owns the sole visible title');
  assert.equal(await frame.locator('#connectionDialog').getAttribute('aria-labelledby'),null,'embedded dialog must not refer to a removed heading');
  assert.equal(await frame.locator('.connection-intro').isVisible(),true,'step instructions remain visible');
  console.log('PASS embedded connection panel keeps instructions without duplicate header controls');
 }finally{await browser.close()}
})().catch(error=>{console.error(error);process.exitCode=1});
