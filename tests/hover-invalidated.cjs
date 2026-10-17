const fs=require('node:fs'),assert=require('node:assert/strict'),vm=require('node:vm'),{chromium}=require('playwright');
(async()=>{
  const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
  try{
    const page=await browser.newPage({viewport:{width:500,height:400}});
    await page.setContent('<video style="display:block;width:400px;height:250px"></video>');
    await page.addScriptTag({content:'const attach=Element.prototype.attachShadow;Element.prototype.attachShadow=function(options){return attach.call(this,{...options,mode:"open"})};window.chrome={storage:{local:{get:async()=>({hoverDownloadEnabled:true})},onChanged:{addListener(){}}},runtime:{sendMessage:async()=>{throw Error("Extension context invalidated.")}}}'});
    const source=fs.readFileSync('extension/video-hover.js','utf8');
    await page.addScriptTag({content:source});
    await page.mouse.move(100,100);
    const hover=page.locator('#jingcai-video-download');await hover.waitFor({state:'visible'});
    await page.evaluate(()=>document.querySelector('#jingcai-video-download').shadowRoot.querySelector('button').click());
    await page.waitForFunction(()=>document.querySelector('#jingcai-video-download').shadowRoot.textContent.includes('刷新当前网页'));
    assert.doesNotMatch(await hover.evaluate(el=>el.shadowRoot.textContent),/Extension context invalidated/);
    await page.evaluate(()=>{delete globalThis.__jingcaiVideoHover;});await page.addScriptTag({content:source});
    assert.equal(await page.locator('#jingcai-video-download').count(),1);
  }finally{await browser.close();}
  const injected=[];
  const chrome={permissions:{contains:async()=>true},scripting:{getRegisteredContentScripts:async()=>[{id:'jingcai-video-hover'}],updateContentScripts:async()=>{},executeScript:async options=>injected.push(options)},storage:{local:{get:async()=>({hoverDownloadEnabled:true})}},tabs:{query:async()=>[{id:1,url:'https://example.com/'},{id:2,url:'chrome://extensions'},{id:3,url:'https://another.example/'}]}};
  const context=vm.createContext({chrome,webpageUrl:url=>/^https?:/.test(url)});
  vm.runInContext(fs.readFileSync('extension/hover-control.js','utf8'),context);
  await context.restoreHoverDownload();
  assert.deepEqual(injected.map(x=>x.target.tabId),[1,3]);
  console.log('PASS invalidated hover message, stale button replaced, open tabs reinjected');
})().catch(error=>{console.error(error);process.exitCode=1});
