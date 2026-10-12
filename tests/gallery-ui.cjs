const fs=require('fs'),assert=require('assert/strict'),{chromium}=require('playwright');
(async()=>{const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});try{
 const page=await browser.newPage({viewport:{width:390,height:900}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('https://sns.xhscdn.com/**',r=>r.abort());
 await page.setContent(fs.readFileSync('extension/video.html','utf8').replace(/<script[^>]*>[\s\S]*?<\/script>/g,'').replace(/<link[^>]*>/g,''));
 for(const name of ['prompt','video','embedded','task-ui','interface','theme'])await page.addStyleTag({path:'extension/'+name+'.css'});
 await page.evaluate(()=>{window.sent=[];window.permissionAllowed=true;window.opened=[];window.setTaskListLoading=()=>{};
 const gallery={ok:true,kind:'gallery',draftId:'a'.repeat(32),title:'测试图集',directory:'D:\\Images',images:[{url:'https://sns.xhscdn.com/one',width:1080,height:1440},{url:'https://sns.xhscdn.com/two',width:1080,height:1440}]};
 window.chrome={permissions:{request:async p=>{sent.push({action:'permission',...p});return permissionAllowed}},tabs:{query:async()=>[],create:async p=>opened.push(p.url)},windows:{getCurrent:async()=>({id:1})},storage:{onChanged:{addListener(){}},session:{get:async()=>({}),set:async()=>{}},local:{get:async()=>({}),set:async()=>{}}},runtime:{sendMessage:async m=>{sent.push(m);if(m.action==='video-status')return {ok:true,directory:'D:\\Images'};if(m.action==='video-jobs')return {ok:true,items:[]};if(m.action==='video-gallery-image-info')return {ok:true,format:m.index===1?'png':'webp',bytes:31744};if(m.action==='video-gallery-start')return {ok:true,id:'job',directory:'D:\\Images\\Album'};if(m.action==='video-page-media')return {...gallery,videos:[]};if(m.action==='video-info'||m.action==='video-image-preview')return gallery;throw Error(m.action)}}};});
 for(const name of ['video-url','gallery-cards','video'])await page.addScriptTag({path:'extension/'+name+'.js'});
 await page.waitForFunction(()=>document.getElementById('status').textContent==='下载引擎已就绪');
 await page.locator('#url').fill('https://www.xiaohongshu.com/explore/abcdef');await page.locator('#inspect').click();await page.locator('#galleryCard').waitFor({state:'visible'});
 assert.equal(await page.locator('.gallery-item').count(),2);assert.equal(await page.evaluate(()=>sent.filter(x=>x.action==='video-gallery-start').length),0);
 await page.waitForFunction(()=>document.querySelector('.gallery-bytes').textContent==='31 KB');
 const first=page.locator('.gallery-item').first();await first.getByRole('button',{name:'新标签页打开图片'}).click();assert.deepEqual(await page.evaluate(()=>opened),['https://sns.xhscdn.com/one']);
 await first.getByRole('button',{name:'下载为',exact:true}).click();await first.getByRole('menuitem',{name:'PNG',exact:true}).click();await page.waitForFunction(()=>sent.some(x=>x.action==='video-gallery-start'));
 assert.deepEqual(await page.evaluate(()=>{const m=sent.find(x=>x.action==='video-gallery-start');return [m.selectedIndexes,m.imageFormat,m.confirmed]}),[[0],'png',true]);assert.equal(await page.locator('#galleryCard').isVisible(),true);
 assert.equal(await page.locator('#galleryTypeFilter .gallery-type-toggle').count(),1);await page.locator('.gallery-type-toggle').click();await page.getByRole('menuitemradio',{name:'PNG (1)',exact:true}).click();assert.equal(await page.locator('.gallery-item:visible').count(),1);
 await page.locator('#gallerySelectNone').click();assert.equal(await page.locator('#confirmGallery').isDisabled(),true);await page.locator('.gallery-item').nth(1).locator('input').check();await page.locator('#confirmGallery').click();await page.locator('#galleryCard').waitFor({state:'hidden'});
 assert.deepEqual(await page.evaluate(()=>{const m=sent.filter(x=>x.action==='video-gallery-start').at(-1);return [m.selectedIndexes,m.imageFormat]}),[[1],'original']);
 await page.locator('#url').fill('https://huggingface.co/jialinyyzz/humanizer');await page.locator('#inspect').click();await page.locator('#galleryCard').waitFor({state:'visible'});assert.equal(await page.evaluate(()=>sent.some(x=>x.action==='video-page-media'&&x.windowId===1)),true);
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await page.screenshot({path:'work/gallery-integrated.png',fullPage:true});await page.locator('.gallery-type-toggle').click();await page.screenshot({path:'work/gallery-type-dropdown.png'});await page.keyboard.press('Escape');
 const permissionCount=await page.evaluate(()=>sent.filter(m=>m.action==='permission').length);
 for(const ext of ['jpg','gif','png','bmp','svg','webp','ico','tiff','avif']){await page.locator('#url').fill('https://example.com/picture.'+ext);await page.locator('#inspect').click();assert.equal(await page.evaluate(()=>sent.filter(m=>m.action==='video-image-preview').at(-1)?.url),'https://example.com/picture.'+ext);}
 assert.equal(await page.evaluate(()=>sent.filter(m=>m.action==='permission').length),permissionCount);await page.locator('#url').fill('https://huggingface.co/jialinyyzz/humanizer');
 await page.evaluate(()=>permissionAllowed=false);await page.locator('#inspect').click();await page.waitForFunction(()=>document.getElementById('error').textContent.includes('允许读取'));assert.deepEqual(errors,[]);
 console.log('PASS integrated gallery badges/open/individual conversion/batch selection/current webpage capture/permission denial/narrow layout');
}finally{await browser.close()}})().catch(e=>{console.error(e);process.exitCode=1});
