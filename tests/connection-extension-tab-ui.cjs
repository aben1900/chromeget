const assert=require('assert/strict'),{chromium}=require('playwright');

(async()=>{
 const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
 try{
  const context=await browser.newContext(),library=await context.newPage(),sidebar=await context.newPage();
  for(const page of [library,sidebar]){
   await page.route('https://extension.test/**',route=>route.fulfill({body:'<body>Extension page</body>',contentType:'text/html'}));
  }
  await library.goto('https://extension.test/library.html');
  await library.evaluate(()=>{
   window.chrome={runtime:{getURL:path=>'https://extension.test/'+path},tabs:{getCurrent:async()=>({id:9})}};
   window.rendered=[];
  });
  await library.addScriptTag({path:'extension/window-overlay.js'});
  await library.evaluate(()=>{window.OverlayWindowRender=(...args)=>rendered.push(args)});
  await sidebar.goto('https://extension.test/app.html');
  await sidebar.evaluate(()=>{
   window.created=[];
   window.chrome={runtime:{getURL:path=>'https://extension.test/'+path},windows:{getCurrent:async()=>({id:4})},tabs:{query:async()=>[{id:9,url:'https://extension.test/library.html'}],create:async options=>created.push(options)},scripting:{executeScript:async()=>{throw Error('extension pages cannot be injected')}}};
  });
  await sidebar.addScriptTag({path:'extension/connection-review.js'});
  assert.equal(await sidebar.evaluate(()=>ConnectionReview.open()),true);
  await library.waitForFunction(()=>rendered.length===1);
  assert.equal(await library.evaluate(()=>rendered[0][2]),'connection');
  assert.equal(await sidebar.evaluate(()=>created.length),0,'library page should reuse the browser tab');
  await sidebar.evaluate(async()=>{
   const channel=new BroadcastChannel('chromeget-connection-overlay'),token='model-token';
   const waitFor=type=>new Promise(resolve=>{channel.onmessage=event=>{if(event.data?.type===type&&event.data.token===token)resolve()}});
   const ready=waitFor('ready');
   channel.postMessage({type:'prepare',tabId:9,token,tool:'model',title:'模型设置',url:'https://extension.test/model-settings.html?overlay=model-token'});
   await ready;
   const opened=waitFor('opened');channel.postMessage({type:'commit',token});await opened;channel.close();
  });
  assert.equal(await library.evaluate(()=>rendered.at(-1)[2]),'model','other tools should render inside the same extension tab');
  await library.evaluate(()=>{rendered=[];chrome.tabs.getCurrent=()=>new Promise(resolve=>setTimeout(()=>resolve({id:9}),1200))});
  assert.equal(await sidebar.evaluate(()=>ConnectionReview.open()),true);
  assert.equal(await sidebar.evaluate(()=>created.length),1,'an unresponsive extension tab should use a same-window tab');
  await library.waitForTimeout(1300);
  assert.equal(await library.evaluate(()=>rendered.length),0,'late acknowledgements must not create a duplicate overlay');
  console.log('PASS tool overlays open inside the active extension tab without late duplicates');
 }finally{await browser.close()}
})().catch(error=>{console.error(error);process.exitCode=1});
