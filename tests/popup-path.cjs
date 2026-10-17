const fs=require('node:fs');
const assert=require('node:assert/strict');
const {chromium}=require('playwright');

(async()=>{
  const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
  try{
    const page=await browser.newPage(),errors=[];
    page.on('pageerror',error=>errors.push(error.message));
    await page.setContent(fs.readFileSync('extension/popup.html','utf8').replace(/<script[\s\S]*?<\/script>/g,''));
    await page.evaluate(()=>{
      window.calls=[];
      window.chrome={runtime:{sendMessage:async message=>{
        calls.push(message);
        return {ok:true,records:[],total:0,defaultJournalPath:'F:/摘录数据.json',journalPath:message.action==='choose-json'?'E:/archive.json':'F:/摘录数据.json'};
      }}};
    });
    await page.addScriptTag({path:'extension/popup.js'});
    await page.waitForFunction(()=>document.querySelector('#jsonPath').textContent.includes('.json'));
    assert.equal(await page.textContent('#jsonPath'),'F:/摘录数据.json');
    assert.match(await page.locator('#jsonSwitchStatus').textContent(),/当前已是默认保存文件/);
    assert.equal(await page.locator('#jsonPath').evaluate(element=>element.closest('summary')===null),true);
    await page.locator('#chooseJson').locator('xpath=ancestor::details[1]').evaluate(element=>element.open=true);
    await page.click('#chooseJson');
    await page.waitForFunction(()=>document.querySelector('#jsonPath').textContent==='E:/archive.json');
    assert.match(await page.locator('#jsonSwitchStatus').textContent(),/正在查看其他摘录文件/);
    await page.click('#defaultJson');
    await page.waitForFunction(()=>document.querySelector('#jsonPath').textContent==='F:/摘录数据.json');
    assert.match(await page.locator('#jsonSwitchStatus').textContent(),/当前已是默认保存文件/);
    assert.deepEqual(await page.evaluate(()=>calls.map(message=>message.action)),['list','choose-json','default-json']);
    assert.deepEqual(errors,[]);
    console.log('PASS current JSON path appears in dropdown status line and tracks file switching');
  }finally{await browser.close()}
})().catch(error=>{console.error(error);process.exitCode=1});
