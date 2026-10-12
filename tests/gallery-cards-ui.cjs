const fs=require('fs'),assert=require('assert/strict'),{chromium}=require('playwright');
(async()=>{const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});try{
 const page=await browser.newPage({viewport:{width:360,height:740}});await page.route('https://sns.xhscdn.com/**',r=>r.abort());
 await page.setContent('<div id="galleryGrid"></div>');await page.addStyleTag({path:'extension/video.css'});
 await page.addScriptTag({path:'extension/gallery-cards.js'});
 await page.evaluate(()=>{window.events=[];window.cards=GalleryCards.render(document.getElementById('galleryGrid'),[{url:'https://sns.xhscdn.com/one',width:1080,height:1440},{url:'https://sns.xhscdn.com/two'}],{onSelection:(i,v)=>events.push(['select',i,v]),onDownload:async(i,f)=>events.push(['download',i,f]),open:u=>events.push(['open',u]),metadata:async i=>i===0?{format:'webp',bytes:31744,width:1080,height:1440}:{format:'',bytes:null}});});
 await page.waitForFunction(()=>document.querySelector('.gallery-bytes')?.textContent==='31 KB');
 const first=page.locator('.gallery-item').first();assert.equal(await first.locator('.gallery-format').textContent(),'WEBP');assert.equal(await first.locator('.gallery-dimensions').textContent(),'1080×1440');
 await first.getByRole('button',{name:'新标签页打开图片'}).click();assert.equal(await first.locator('input').isChecked(),true);
 await first.getByRole('button',{name:'下载为'}).click();assert.equal(await first.getByRole('menuitem').count(),4);
 await first.getByRole('menuitem',{name:'JPEG',exact:true}).click();assert.deepEqual(await page.evaluate(()=>events.filter(x=>x[0]==='download')),[['download',0,'jpeg']]);
 assert.equal(await first.getByRole('menu').count(),0);
 await page.evaluate(()=>cards.setBusy(true));assert.equal(await first.getByRole('button',{name:'下载为'}).isDisabled(),true);
 await page.evaluate(()=>cards.setBusy(false));await first.getByRole('button',{name:'下载为'}).click();await page.keyboard.press('Escape');assert.equal(await first.getByRole('menu').count(),0);
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);assert.match(await page.locator('.gallery-item').nth(1).locator('.gallery-bytes').textContent(),/未知/);
 await page.evaluate(()=>cards.destroy());console.log('PASS gallery badges, explicit original/JPEG/PNG/WEBP menu, open without selecting, busy state, Escape and narrow layout');
}finally{await browser.close()}})().catch(e=>{console.error(e);process.exitCode=1});
