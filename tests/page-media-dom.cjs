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
  assert.deepEqual(r.images.map(i=>i.url),['https://huggingface.co/first.png','https://huggingface.co/second.png','https://huggingface.co/vector.svg','https://huggingface.co/header.png','https://huggingface.co/portrait.png','https://huggingface.co/icon.png']);
  assert.equal(r.images[0].width,600);assert.deepEqual(r.videos.map(v=>v.url),['https://huggingface.co/demo.mp4']);
  // HF uses a model-card div in main and an unrelated article for a recommendation card.
  // Selecting any article before main silently drops the actual model-card images.
  await page.setContent('<main><section><div class="model-card-content"><img src="/first.png" width="600" height="400"><img src="/second.png" width="600" height="400"></div></section><aside><article class="overview-card-wrapper"><img src="/portrait.png" width="32" height="32">Related model</article></aside></main>');
  r=await page.evaluate(collectDocumentMedia);assert.deepEqual(r.images.map(i=>i.url),['https://huggingface.co/first.png','https://huggingface.co/second.png','https://huggingface.co/portrait.png']);
  await page.setContent('<main><img data-src="https://cdn.example/lazy.jpg" width="500" height="400"><img src="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==" data-src="https://cdn.example/lazy2.jpg" width="500" height="400"></main>');
  r=await page.evaluate(collectDocumentMedia);assert.deepEqual(r.images.map(i=>i.url),['https://cdn.example/lazy.jpg','https://cdn.example/lazy2.jpg']);
  // Removing a format or keeping the old content-only/icon filters loses these visible images.
  await page.setContent('<header>'+['jpg','gif','png','bmp','svg','webp','ico','tiff','avif'].map(ext=>`<img class="logo icon" src="https://cdn.example/type.${ext}" width="16" height="16">`).join('')+'</header><main><a href="https://cdn.example/original.tif">Original TIFF</a><a href="https://cdn.example/original.tif#duplicate">Duplicate</a><img src="https://cdn.example/pixel.avif" width="1" height="1"><img hidden src="https://cdn.example/hidden.bmp" width="16" height="16"><iframe src="https://cdn.example/frame.html"></iframe></main>');
  r=await page.evaluate(collectDocumentMedia);
  assert.deepEqual(r.images.map(i=>i.format),['tiff','jpeg','gif','png','bmp','svg','webp','ico','tiff','avif']);
  assert.deepEqual(r.images[0],{url:'https://cdn.example/original.tif',width:0,height:0,format:'tiff'});
  assert.ok(r.images.every(i=>Object.keys(i).sort().join(',')==='format,height,url,width'));
  // Only newly serialized passive SVG is allowed as data media; page-provided data stays excluded.
  await page.setContent(`<main><svg aria-hidden="true" viewBox="0 0 24 24" width="24" height="24" onload="void 0"><defs><path id="shape" d="M0 0h20v20z"/><linearGradient id="paint"><stop offset="0" stop-color="red"/></linearGradient></defs><use href="#shape" fill="url(#paint)"/><path d="M0 0h5v5z" fill="url(https://evil.example/paint)" style="fill:url(https://evil.example/style)"/><script>void 0</script><foreignObject><div>unsafe</div></foreignObject><image href="https://evil.example/a.png"/><use href="https://evil.example/a.svg#icon"/><animate attributeName="href" values="https://evil.example"/></svg><img src="data:image/svg+xml;base64,PHN2Zy8+" width="24" height="24"><svg width="1" height="1"/><div hidden><svg width="24" height="24"/></div></main>`);
  r=await page.evaluate(collectDocumentMedia);assert.equal(r.images.length,1);
  assert.equal(r.images[0].format,'svg');assert.equal(r.images[0].width,24);assert.equal(r.images[0].height,24);
  assert.match(r.images[0].url,/^data:image\/svg\+xml;base64,[A-Za-z0-9+/]+=*$/);
  const svg=Buffer.from(r.images[0].url.split(',')[1],'base64').toString('utf8');
  assert.match(svg,/<svg[^>]+xmlns="http:\/\/www.w3.org\/2000\/svg"/);assert.match(svg,/viewBox="0 0 24 24"/);assert.match(svg,/href="#shape"/);assert.match(svg,/fill="url\(#paint\)"/);
  assert.doesNotMatch(svg,/script|foreignObject|onload|\sstyle=|<image|animate|https:\/\/evil/);
  await page.setContent('<main><svg class="chromeget-preview" width="24" height="24"><path d="M0 0h10v10z"/></svg><div data-chromeget><svg width="24" height="24"/></div></main>');
  r=await page.evaluate(collectDocumentMedia);assert.equal(r.images.length,0,'extension-owned SVG must be excluded');
  // Sprite icons use same-document definitions outside the visible SVG root.
  await page.setContent('<svg style="display:none"><defs><symbol id="shared-icon" viewBox="0 0 24 24"><use href="#shared-shape"/><script>void 0</script></symbol><path id="shared-shape" d="M0 0h24v24z" onclick="void 0"/></defs></svg><main><svg viewBox="0 0 24 24" width="24" height="24"><use href="#shared-icon"/></svg><svg viewBox="0 0 24 24" width="24" height="24"><use href="#shared-icon"/></svg></main>');
  r=await page.evaluate(collectDocumentMedia);assert.equal(r.images.length,1);
  const sprite=Buffer.from(r.images[0].url.split(',')[1],'base64').toString('utf8');
  assert.match(sprite,/<symbol[^>]+id="shared-icon"/);assert.match(sprite,/<path[^>]+id="shared-shape"/);assert.doesNotMatch(sprite,/onclick|script/);
  const spriteAlpha=await page.evaluate(async url=>{const image=new Image();image.src=url;await image.decode();const canvas=document.createElement('canvas');canvas.width=24;canvas.height=24;const context=canvas.getContext('2d');context.drawImage(image,0,0,24,24);return context.getImageData(18,6,1,1).data[3];},r.images[0].url);
  assert.equal(spriteAlpha,255,'exported sprite icon must render its copied geometry');
  // Presentation from CSS and inherited currentColor must survive independent export.
  await page.setContent('<style>svg line {stroke:red;stroke-width:4} .overridden rect {fill:inherit}</style><main><svg width="24" height="24"><line x1="2" y1="12" x2="22" y2="12"/></svg><div style="color:rgb(0,128,255)"><svg width="24" height="24"><rect width="24" height="24" fill="currentColor"/></svg></div><svg class="overridden" fill="purple" width="24" height="24"><rect fill="red" width="24" height="24"/></svg></main>');
  r=await page.evaluate(collectDocumentMedia);assert.equal(r.images.length,3);
  const paintPixels=await page.evaluate(async urls=>Promise.all(urls.map(async url=>{const image=new Image();image.src=url;await image.decode();const canvas=document.createElement('canvas');canvas.width=24;canvas.height=24;const context=canvas.getContext('2d');context.drawImage(image,0,0,24,24);return Array.from(context.getImageData(12,12,1,1).data);})),r.images.map(item=>item.url));
  assert.deepEqual(paintPixels,[[255,0,0,255],[0,128,255,255],[128,0,128,255]]);
  await page.setContent(`<style>.painted {fill:url("${source}#css-paint")} .blocked {fill:url("https://evil.example/paint.svg#paint")}</style><svg style="display:none"><defs><linearGradient id="css-paint"><stop offset="0" stop-color="lime"/></linearGradient></defs></svg><main><svg width="24" height="24"><rect class="painted" width="24" height="24"/><path class="blocked" d="M0 0h5v5z"/></svg></main>`);
  r=await page.evaluate(collectDocumentMedia);assert.equal(r.images.length,1);
  const cssPaint=Buffer.from(r.images[0].url.split(',')[1],'base64').toString('utf8');
  assert.match(cssPaint,/fill="url\(#css-paint\)"/);assert.match(cssPaint,/<linearGradient[^>]+id="css-paint"/);assert.doesNotMatch(cssPaint,/evil\.example|https:\/\/huggingface|class=|\sstyle=/);
  await page.setContent('<svg style="display:none"><symbol id="colored-symbol" viewBox="0 0 24 24"><rect fill="currentColor" width="24" height="24"/></symbol></svg><main style="color:red"><svg width="24" height="24"><use href="#colored-symbol"/></svg></main>');
  r=await page.evaluate(collectDocumentMedia);assert.equal(r.images.length,1);
  const symbolPixel=await page.evaluate(async url=>{const image=new Image();image.src=url;await image.decode();const canvas=document.createElement('canvas');canvas.width=24;canvas.height=24;const context=canvas.getContext('2d');context.drawImage(image,0,0,24,24);return Array.from(context.getImageData(12,12,1,1).data);},r.images[0].url);
  assert.deepEqual(symbolPixel,[255,0,0,255],'imported definitions must inherit the consuming icon color');
  // Oversized vectors and aggregate data cannot overflow native messaging; duplicates cost no budget.
  const shape='M0 0 '+ 'L1 1 '.repeat(15000);
  await page.setContent('<main>'+Array.from({length:8},(_,i)=>`<svg width="24" height="24"><path id="p${i}" d="${shape}"/></svg>`).join('')+`<svg width="24" height="24"><path d="${'M0 0 '.repeat(30000)}"/></svg></main>`);
  r=await page.evaluate(collectDocumentMedia);assert.ok(r.images.length>1 && r.images.length<8);
  assert.ok(r.images.reduce((sum,i)=>sum+i.url.length,0)<=512*1024);
  assert.ok(r.images.every(i=>Buffer.from(i.url.split(',')[1],'base64').length<=128*1024));
  await page.setContent('<main><svg viewBox="0 0 20 16" width="20" height="16"><path d="M0 0h10v10z"/></svg><svg viewBox="0 0 20 16" width="20" height="16"><path d="M0 0h10v10z"/></svg></main>');
  r=await page.evaluate(collectDocumentMedia);assert.equal(r.images.length,1);
  await page.setContent('<main><a href="/jialinyyzz/humanizer/blob/main/model.safetensors">model.safetensors</a></main>');
  r=await page.evaluate(collectDocumentMedia);assert.equal(r.images.length,0);assert.equal(r.videos.length,0);assert.equal(r.modelRepoUrl,source);
  await page.setContent('<main>'+Array.from({length:120},(_,i)=>`<img data-src="https://cdn.example/${i}.jpg" width="500" height="400">`).join('')+Array.from({length:40},(_,i)=>`<a href="https://cdn.example/${i}.mp4">Video</a>`).join('')+'</main>');
  r=await page.evaluate(collectDocumentMedia);assert.equal(r.images.length,100);assert.equal(r.videos.length,30);
  console.log('PASS page-media real DOM HF card, responsive/lazy images, exclusions, dedup, videos, repo hint and caps');
 } finally {await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
