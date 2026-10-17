const assert=require('node:assert/strict');
const {chromium}=require('playwright');

(async()=>{
 const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
 try{
  const page=await browser.newPage({viewport:{width:300,height:200}});
  await page.addScriptTag({path:'extension/gallery-capture.js'});
  const result=await page.evaluate(async()=>{
   function image(colors){const canvas=document.createElement('canvas');canvas.width=100;canvas.height=60;const ctx=canvas.getContext('2d');colors.forEach((color,index)=>{ctx.fillStyle=color;ctx.fillRect(0,index*20,100,20)});return canvas.toDataURL('image/png')}
   const first=image(['red','green','blue']),second=image(['blue','yellow','purple']);
   const output=await GalleryCapture.stitchLong([{png:first,scrollTop:0},{png:second,scrollTop:40}],{rect:{x:0,y:0,width:100,height:60},viewport:{width:100,height:60}});
   const bitmap=new Image();bitmap.src=output.png;await bitmap.decode();const canvas=document.createElement('canvas');canvas.width=output.width;canvas.height=output.height;const ctx=canvas.getContext('2d');ctx.drawImage(bitmap,0,0);
   return {width:output.width,height:output.height,rows:[10,30,50,70,90].map(y=>[...ctx.getImageData(50,y,1,1).data].slice(0,3))};
  });
  assert.deepEqual(result,{width:100,height:100,rows:[[255,0,0],[0,128,0],[0,0,255],[255,255,0],[128,0,128]]});
  console.log('PASS long screenshot stitches only new scroll pixels');
 }finally{await browser.close()}
})().catch(error=>{console.error(error);process.exitCode=1});
