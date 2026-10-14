'use strict';
const fs = require('fs');
const assert = require('assert/strict');
const {chromium} = require('playwright');

(async () => {
 const browser = await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
 try {
  const page = await browser.newPage();
  page.setDefaultTimeout(4000);
  let connected = false, release;
  const profiles = require('../native/ai-provider.cjs').presets();
  profiles.openai.hasKey = true;
  await page.exposeFunction('request', async m => {
   if (!connected) return undefined;
   if (m.action === 'ai-settings-get') return {ok:true,profiles,defaultProfileId:'openai',selectionRevision:'s',importsCompleted:true};
   if (m.action === 'ai-test-draft') return new Promise(r => release = r);
   if (m.action === 'ai-model-import-preview') return {ok:true,previewId:'p',items:[{candidateId:'new',label:'Imported',model:'m',change:'add'},{candidateId:'edited',label:'Edited',model:'n',change:'update',conflict:true}]};
   return {ok:true};
  });
  async function openSettings() {
   await page.goto('about:blank');
   await page.setContent(fs.readFileSync('extension/model-settings.html','utf8').replace(/<script[^>]*>[\s\S]*?<\/script>/g,'').replace(/<link[^>]*>/g,''));
   await page.addStyleTag({path:'extension/library.css'});
   await page.evaluate(() => {window.reloadRequested = 0;window.chrome = {runtime:{sendMessage:m => window.request(m),reload:() => window.reloadRequested++},storage:{local:{get:async () => ({}),set:async () => {}}}};});
   for (const script of ['library-ai-view.js','library-ai-api.js','library-ai-settings.js']) await page.addScriptTag({path:'extension/'+script});
  }

  await openSettings();
  await page.waitForFunction(() => document.getElementById('aiSettingsStatus').textContent.includes('扩展后台'));
  assert.equal(await page.isVisible('#aiReloadExtension'),true);
  assert.equal(await page.isVisible('#aiReloadHint'),true);
  assert.equal(await page.isEnabled('#aiAddModel'),false);
  await page.click('#aiReloadExtension');
  assert.equal(await page.evaluate(() => window.reloadRequested),1,'the recovery action reloads the extension');

  connected = true;
  await openSettings();
  await page.waitForSelector('[data-model-id="openai"]');
  assert.equal(await page.isVisible('#aiReloadExtension'),false);
  assert.equal(await page.isEnabled('#aiAddModel'),true);
  await page.locator('[data-model-id="openai"]').getByRole('button',{name:'编辑',exact:true}).click();
  await page.click('#aiTest');
  await page.waitForFunction(() => document.getElementById('aiBatchStatus').textContent.includes('测试 1 /'));
  await page.click('#aiCancelDialog');
  await page.locator('[data-model-id="deepseek"]').getByRole('button',{name:'编辑',exact:true}).click();
  release({ok:true});
  await page.waitForTimeout(80);
  assert.equal(await page.locator('#aiDialogStatus').textContent(),'','late test must not alter another editor');
  await page.click('#aiCancelDialog');

  await page.click('#aiImportModels');
  await page.click('#aiImportWorkBuddy');
  await page.waitForSelector('#aiImportList input[value="edited"]');
  assert.equal(await page.locator('#aiImportList input[value="edited"]').isChecked(),false);
  assert.equal(await page.locator('#aiImportList input[value="new"]').isChecked(),true);
  await page.click('#aiCloseImport');
  assert.equal(await page.isVisible('#aiDefaultModel'),true);
  console.log('PASS extension reload guidance, reopened settings recovery, late test isolation, import conflict opt-in and default picker');
 } finally {await browser.close();}
})().catch(e => {console.error(e);process.exitCode = 1;});
