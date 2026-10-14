const fs=require('fs'),assert=require('assert/strict'),{chromium}=require('playwright');

(async()=>{
 const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
 try{
  const page=await browser.newPage({viewport:{width:1240,height:860}}),errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.route('https://website.test/**',route=>route.fulfill({body:'<body><h1>原网页内容</h1></body>',contentType:'text/html'}));
  await page.route('https://extension.test/**',route=>{
   const name=new URL(route.request().url()).pathname.slice(1);
   if(!/^[\w.-]+$/.test(name)||!fs.existsSync('extension/'+name))return route.abort();
   const contentType=name.endsWith('.css')?'text/css':name.endsWith('.js')?'text/javascript':'text/html';
   const body=name.endsWith('.js')&&name!=='tool-page.js'?'':fs.readFileSync('extension/'+name);
   return route.fulfill({body,contentType});
  });
  await page.goto('https://website.test/');
  await page.evaluate(()=>{
   const attach=Element.prototype.attachShadow;
   Element.prototype.attachShadow=function(options){return attach.call(this,{...options,mode:'open'})};
   window.chrome={runtime:{sendMessage:async()=>({ok:true})}};
  });
  await page.addScriptTag({path:'extension/window-overlay.js'});
  for(const [tool,title,pageName] of [['model','模型设置','model-settings.html'],['translate','比对翻译页','translate.html']]){
   await page.evaluate(([url,token,kind,label])=>OverlayWindowRender(url,token,kind,label),['https://extension.test/'+pageName+'?overlay='+tool,tool,tool,title]);
   const host=page.locator(`[data-chromeget-tool-overlay="${tool}"]`);
   const frame=host.frameLocator('iframe');
   await frame.locator('main').waitFor();
   assert.equal(await host.locator('header strong').innerText(),title);
   assert.equal(await host.locator('[data-overlay-fullscreen]').getAttribute('aria-label'),'最大化');
   assert.equal(await frame.locator('.tool-page-header').count(),0,'embedded page should not duplicate its header');
   if(tool==='model')assert.equal(await frame.locator('main>h1').isVisible(),false,'embedded model page should not duplicate the title');
   if(tool==='model')await page.screenshot({path:'work/tool-overlay-model.png'});
   await host.locator('[data-overlay-fullscreen]').click();
   assert.equal(await host.locator('[data-overlay-fullscreen]').getAttribute('aria-label'),'恢复窗口');
   await host.locator('[data-overlay-close]').click();
   assert.equal(await host.count(),0);
  }
  assert.deepEqual(errors,[]);
  console.log('PASS model and translation pages render in unified browser overlay with fullscreen controls');
 }finally{await browser.close()}
})().catch(error=>{console.error(error);process.exitCode=1});
