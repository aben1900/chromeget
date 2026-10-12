const assert=require('node:assert/strict'),fs=require('node:fs'),{chromium}=require('playwright');
assert.ok(fs.existsSync('extension/page-media.js'),'current-page DOM media collector must exist');
const {collectDocumentMedia}=require('../extension/page-media.js');
const source='https://huggingface.co/jialinyyzz/humanizer';
(async()=>{
 const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
 try {
  const page=await browser.newPage({viewport:{width:1000,height:800}});
  await page.route('**/*',async route=>{
   const url=route.request().url();
   if(url===source)return route.fulfill({contentType:'text/html',body:`<title>Humanizer model card</title><header><img src="/header.png" width="300" height="100"></header><main><div class="avatar"><img src="/portrait.png" width="200" height="200"></div><article>
    <img src="/first.png" width="600" height="400" data-src="/unwanted.png">
    <img src="/small.png" srcset="/second.png 1200w" sizes="100vw" width="600" height="400">
    <img src="/first.png" width="600" height="400"><img src="/icon.png" width="24" height="24"><img src="/beacon.png" width="600" height="400">
    <div hidden><img src="/hidden.png" width="600" height="400"></div><div style="opacity:0"><img src="/transparent.png" width="600" height="400"></div>
    <div id="jingcai-overlay"><img src="/injected.png" width="600" height="400"></div>
    <img src="/vector.svg" width="600" height="400"><img src="http://127.0.0.1/private.png" width="600" height="400">
    <video width="400" height="200"><source src="/demo.mp4" type="video/mp4"></video><a href="/demo.mp4">Demo</a><a href="/stream.m3u8">stream</a><a href="/weights.safetensors">weights</a>
   </article></main>`});
   if(url.endsWith('/beacon.png'))return route.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"/>'});
   if(/\.(png|svg)$/.test(new URL(url).pathname))return route.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="600" height="400"><rect width="600" height="400" fill="blue"/></svg>'});
   return route.abort();
  });
  await page.goto(source);let r=await page.evaluate(collectDocumentMedia);
  assert.equal(r.url,source);assert.equal(r.title,'Humanizer model card');
  assert.deepEqual(r.images.map(i=>i.url),['https://huggingface.co/first.png','https://huggingface.co/second.png']);
  assert.equal(r.images[0].width,600);assert.deepEqual(r.videos.map(v=>v.url),['https://huggingface.co/demo.mp4']);
  // HF uses a model-card div in main and an unrelated article for a recommendation card.
  // Selecting any article before main silently drops the actual model-card images.
  await page.setContent('<main><section><div class="model-card-content"><img src="/first.png" width="600" height="400"><img src="/second.png" width="600" height="400"></div></section><aside><article class="overview-card-wrapper"><img src="/portrait.png" width="32" height="32">Related model</article></aside></main>');
  r=await page.evaluate(collectDocumentMedia);assert.deepEqual(r.images.map(i=>i.url),['https://huggingface.co/first.png','https://huggingface.co/second.png']);
  await page.setContent('<main><img data-src="https://cdn.example/lazy.jpg" width="500" height="400"><img src="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==" data-src="https://cdn.example/lazy2.jpg" width="500" height="400"></main>');
  r=await page.evaluate(collectDocumentMedia);assert.deepEqual(r.images.map(i=>i.url),['https://cdn.example/lazy.jpg','https://cdn.example/lazy2.jpg']);
  await page.setContent('<main><a href="/jialinyyzz/humanizer/blob/main/model.safetensors">model.safetensors</a></main>');
  r=await page.evaluate(collectDocumentMedia);assert.equal(r.images.length,0);assert.equal(r.videos.length,0);assert.equal(r.modelRepoUrl,source);
  await page.setContent('<main>'+Array.from({length:120},(_,i)=>`<img data-src="https://cdn.example/${i}.jpg" width="500" height="400">`).join('')+Array.from({length:40},(_,i)=>`<a href="https://cdn.example/${i}.mp4">Video</a>`).join('')+'</main>');
  r=await page.evaluate(collectDocumentMedia);assert.equal(r.images.length,100);assert.equal(r.videos.length,30);
  console.log('PASS page-media real DOM HF card, responsive/lazy images, exclusions, dedup, videos, repo hint and caps');
 } finally {await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
