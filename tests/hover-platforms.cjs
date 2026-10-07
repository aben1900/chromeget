const fs=require('fs'),assert=require('assert/strict'),{chromium}=require('playwright');
(async()=>{const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});try{
const page=await browser.newPage({viewport:{width:600,height:600}});
await page.route('https://x.com/**',r=>r.fulfill({contentType:'text/html',body:'<article><a href="/writer/status/123456"><time>Today</time></a><video style="width:400px;height:250px"></video><div style="position:absolute;top:35px;left:8px;width:400px;height:220px"></div></article>'}));await page.goto('https://x.com/home');
await page.addScriptTag({content:`const messages=[];const chrome={storage:{local:{get:async()=>({hoverDownloadEnabled:true})},onChanged:{addListener(){}}},runtime:{sendMessage:async m=>(messages.push(m),{ok:true})}};`});await page.addScriptTag({content:fs.readFileSync('extension/video-hover.js','utf8')});
async function click(){await page.mouse.move(100,60);await page.waitForFunction(()=>document.getElementById('jingcai-video-download').style.display==='block');const r=await page.locator('#jingcai-video-download').boundingBox();await page.mouse.click(r.x+40,r.y+15);}
await click();assert.equal(await page.evaluate(()=>messages[0].pageUrl),'https://x.com/i/web/status/123456');
await page.evaluate(()=>{history.pushState({},'','/writer/status/999999');document.querySelector('article a').href='/writer/status/999999';});await click();assert.equal(await page.evaluate(()=>messages.at(-1).pageUrl),'https://x.com/i/web/status/999999');
await page.addScriptTag({content:fs.readFileSync('extension/video-url.js','utf8')});
for(const [url,name] of [['https://www.tiktok.com/@u/video/123','TikTok'],['https://www.reddit.com/r/test/comments/abc/video/','Reddit'],['https://vimeo.com/123','Vimeo'],['https://www.twitch.tv/videos/123','Twitch']])assert.deepEqual(await page.evaluate(u=>[!!supportedVideoUrl(u),websiteName(u),videoSite(u)],url),[true,name,'']);
console.log('PASS X feed selection, SPA navigation/reused player, TikTok/Reddit/Vimeo/Twitch routes and cookie isolation');
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
