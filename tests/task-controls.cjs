const fs=require('fs'),assert=require('assert/strict'),{chromium}=require('playwright');
(async()=>{
 const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
 try{
 const page=await browser.newPage({viewport:{width:360,height:850}});
 await page.setContent('<style>'+fs.readFileSync('extension/task-ui.css','utf8')+fs.readFileSync('extension/video.css','utf8')+'</style><body class="video-page"><p id="tasksError"></p><div id="tasksList"></div></body>');
 await page.addScriptTag({content:fs.readFileSync('extension/task-ui.js','utf8')});
 await page.evaluate(()=>{
 window.calls=[];window.items=[{id:'a',title:'旧任务缺少操作标记',state:'running',metrics:{total:100,completed:80,speed:5}},{id:'b',title:'其他任务',state:'running'}];
 window.send=async(action,{id})=>{calls.push({action,id});if(action==='video-delete')items=items.filter(t=>t.id!==id);else if(action==='video-pause')items.find(t=>t.id===id).state='paused';else if(action==='video-resume')items.find(t=>t.id===id).state='running';};
 window.poll=async()=>{setupTaskBatch(items,send,poll);document.getElementById('tasksList').replaceChildren(...items.map(t=>renderTaskCard(t,send,poll)));};poll();
 });
 assert.equal(await page.locator('.task-selection').first().isVisible(),false);
 await page.locator('.monitor-card').first().getByRole('button',{name:'暂停',exact:true}).click();
 assert.deepEqual(await page.evaluate(()=>calls),[{action:'video-pause',id:'a'}]);
 await page.locator('.monitor-card').first().getByRole('button',{name:'继续',exact:true}).click();
 assert.equal(await page.evaluate(()=>items[1].state),'running');
 await page.locator('.monitor-card').first().getByRole('button',{name:'删除',exact:true}).click();
 assert.deepEqual(await page.evaluate(()=>items.map(t=>t.id)),['b']);
 await page.locator('#taskBatch summary').click();await page.locator('.task-selection').check();
 assert.equal(await page.locator('#batchPause').isEnabled(),true);assert.equal(await page.locator('#batchResume').isEnabled(),false);
 await page.locator('#taskBatch summary').click();
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 await page.screenshot({path:'work/task-controls.png'});
 console.log('PASS missing flags: individual pause/resume/delete target only one ID; optional batch visibility and state eligibility; 360px layout');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
