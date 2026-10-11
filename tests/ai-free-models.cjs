'use strict';
const fs=require('fs'),vm=require('vm'),assert=require('assert/strict');
const {buildRequest,parseResponse}=require('../native/ai-provider.cjs');
const context={window:{}};vm.runInNewContext(fs.readFileSync('extension/library-ai-api.js','utf8'),context);
const {freePresets,presetFor,catalogGroup}=context.window.LibraryAiApi;
assert.equal(Object.keys(freePresets).length,2);
for(const [id,preset] of Object.entries(freePresets)){
 assert.equal(presetFor(preset),id);
 assert.equal(presetFor({...preset,baseUrl:'https://example.test/v1'}),'');
 assert.equal(presetFor({...preset,models:[{id:'paid-model'}]}),'');
 assert.equal(presetFor({...preset,protocol:'responses'}),'');
 assert.ok(preset.models.some(m=>m.id===preset.model));
 assert.ok(!('key' in preset));
 for(const m of preset.models){
  assert.equal(catalogGroup(m.id),'fast');assert.ok(!m.id.startsWith('Pro/'));
  const p={...preset,model:m.id,secret:'fixture-only'};
  for(const translation of [null,{sourceLanguage:'auto',targetLanguage:'en'}]){
   const r=buildRequest(p,'你好','standard',false,translation);
   assert.equal(r.url,preset.baseUrl+'/chat/completions');
   assert.equal(r.headers.Authorization,'Bearer fixture-only');
   assert.equal(r.body.model,m.id);assert.equal(r.body.stream,false);
   assert.equal(r.body.messages.at(-1).content,'你好');
   assert.match(r.body.messages[0].content,translation?/翻译成英语/:/忠实概括/);
   if(m.id==='Qwen/Qwen2.5-7B-Instruct')assert.equal(r.body.max_tokens,4096);
  }
  assert.equal(buildRequest(p,'test','short',true).body.max_tokens,64);
  assert.throws(()=>buildRequest({...p,secret:''},'Hello','short'),/KEY_NOT_CONFIGURED/);
 }
}
assert.equal(parseResponse('chat-completions',{choices:[{finish_reason:'stop',message:{content:'译文'}}]}),'译文');
assert.throws(()=>parseResponse('chat-completions',{choices:[{finish_reason:'length',message:{content:'截断'}}]}),/OUTPUT_INCOMPLETE/);
console.log('PASS free preset classification, official URLs, auth, translation/summary payloads and output limit');
