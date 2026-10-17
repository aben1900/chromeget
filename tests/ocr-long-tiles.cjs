const assert=require('node:assert/strict');
const {chromium}=require('playwright');

(async()=>{
 const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
 try{
  const page=await browser.newPage();await page.addScriptTag({path:'extension/ocr-tiles.js'});
  const result=await page.evaluate(async()=>{
   const source=document.createElement('canvas');source.width=100;source.height=2500;const context=source.getContext('2d');context.fillStyle='#fff';context.fillRect(0,0,100,2500);context.fillStyle='#f00';context.fillRect(0,1725,100,25);
   const tiles=await OcrTiles.split(source.toDataURL('image/png'));
   const dimensions=[];for(const tile of tiles){const image=new Image();image.src=tile;await image.decode();dimensions.push([image.naturalWidth,image.naturalHeight])}
   return dimensions;
  });
  assert.deepEqual(result,[[100,1800],[100,780]]);
  assert.equal((await page.evaluate(()=>OcrTiles.merge('第一行\n重复行','重复行\n第二行'))),'第一行\n重复行\n第二行');
  console.log('PASS long OCR tiles stay within Windows OCR bounds and dedupe overlap');
 }finally{await browser.close()}
})().catch(error=>{console.error(error);process.exitCode=1});
