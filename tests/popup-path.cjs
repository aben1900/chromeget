const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname,'../extension/popup.js'),'utf8').split("$('extensionId').value")[0];
async function check(result, cached, expected, warning=false) {
  const nodes = {};
  const store = {pending:[],path:cached};
  const context = vm.createContext({document:{getElementById:id=>nodes[id] ||= {}},chrome:{storage:{local:{get:async()=>({...store}),set:async v=>Object.assign(store,v)}},runtime:{sendMessage:async()=>result}}});
  vm.runInContext(source,context);
  await context.refresh();
  assert.equal(nodes.path.textContent,expected);
  assert.equal(nodes.path.textContent.includes('.txt'),false);
  if(warning)assert.ok(nodes.error.textContent.includes('需要更新'));
  if(expected.endsWith('.json')&&result.ok)assert.equal(store.path,expected);
  if(!result.ok&&cached.endsWith('.txt'))assert.equal(store.path,'');
}
(async()=>{
  await check({ok:true,path:'E:\\outputs\\摘录记录.txt',journalPath:'E:\\outputs\\摘录数据.json'},'old.txt','E:\\outputs\\摘录数据.json',true);
  await check({ok:true,path:'new.json',journalPath:'new.json',storageFormat:'json'},'old.txt','new.json');
  await check({ok:false,error:'offline'},'old.txt','尚未获取 JSON 保存路径');
  await check({ok:false,error:'offline'},'cached.json','cached.json');
  await check({ok:true,path:'old.txt'},'cached.json','尚未获取 JSON 保存路径',true);
  console.log('PASS popup JSON path precedence, TXT cache migration, offline cache and legacy host warning');
})().catch(error=>{console.error(error);process.exitCode=1;});
