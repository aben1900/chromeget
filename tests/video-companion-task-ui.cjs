const assert=require('node:assert/strict'),{chromium}=require('playwright');
(async()=>{const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});try{
 const page=await browser.newPage();await page.setContent('<div id="tasksList"></div><p id="tasksError"></p>');await page.addScriptTag({path:'extension/task-ui.js'});
 await page.evaluate(()=>{window.calls=[];const task={id:'a'.repeat(32),title:'Test',state:'completed',companionStatus:'partial',companionError:'配图暂存丢失',companionRetryable:true,createdAt:new Date().toISOString()};document.getElementById('tasksList').append(renderTaskCard(task,async(action,extra)=>{calls.push({action,...extra});return{ok:true}},async()=>{}));});
 assert.match(await page.locator('#tasksList').textContent(),/视频已完成.*配套资料部分失败/s);await page.getByRole('button',{name:'重试配套资料'}).click();assert.equal((await page.evaluate(()=>calls.at(-1))).action,'video-companion-retry');
 console.log('PASS independent companion failure and retry task action');
}finally{await browser.close()}})().catch(e=>{console.error(e);process.exitCode=1});
