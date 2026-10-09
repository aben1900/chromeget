'use strict';
const assert=require('node:assert/strict'),http=require('node:http');
const p=require('../native/ai-provider.cjs'),{requestSummary}=require('../native/ai-transport.cjs');
(async()=>{
 const defaults=p.presets();
 for(const [provider,endpoint] of [['openai','https://api.openai.com/v1/responses'],['deepseek','https://api.deepseek.com/chat/completions']]){
  const req=p.buildRequest({...defaults[provider],secret:'sk-fixture-only'},'原文','standard');assert.equal(req.url,endpoint);assert.equal(req.headers.Authorization,'Bearer sk-fixture-only');assert.equal(req.body.stream,false);
 }
 const req=p.buildRequest({...defaults.openai,secret:'sk-fixture-only'},'原文','standard');assert.equal(req.body.model,'gpt-4.1-mini');assert.equal(req.body.store,false);assert.equal(req.body.max_output_tokens,4096);
 assert.equal(p.buildRequest({...defaults.deepseek,secret:'sk-fixture-only'},'原文','standard').body.thinking.type,'disabled');
 assert.throws(()=>p.buildRequest({...defaults.openai,secret:'sk-placeholder-replace-me'},'原文','standard'),/KEY_NOT_CONFIGURED/);
 assert.throws(()=>p.validateInput('😀'.repeat(24001)),/INPUT_TOO_LARGE/);p.validateInput('😀'.repeat(24000));
 for(const baseUrl of ['http://example.com','https://a.test/?key=x','https://user:pass@a.test','https://a.test/responses'])assert.throws(()=>p.normalizeProfile({...defaults.openai,baseUrl}));
 const claude={provider:'claude',profileId:'fixture',source:'ccswitch',baseUrl:'https://example.test/v1',model:'glm-5.2',auth:'x-api-key',secret:'sk-fixture-only'};
 const cr=p.buildRequest(claude,'文字','short');assert.equal(cr.url,'https://example.test/v1/messages');assert.equal(cr.headers['x-api-key'],'sk-fixture-only');assert.equal(cr.headers['anthropic-version'],'2023-06-01');assert.ok(cr.body.system);
 assert.equal(p.parseResponse('claude',{stop_reason:'end_turn',content:[{type:'thinking',thinking:'隐藏'},{type:'text',text:'摘要'}]}),'摘要');
 assert.equal(p.parseResponse('openai',{status:'completed',output:[{type:'message',content:[{type:'output_text',text:'结果'}]}]}),'结果');
 for(const fixture of [{status:'incomplete',output:[]},{status:'completed',output:[{type:'message',content:[{type:'refusal',refusal:'no'}]}]}])assert.throws(()=>p.parseResponse('openai',fixture));
 assert.throws(()=>p.parseResponse('deepseek',{choices:[{finish_reason:'length',message:{content:'截断'}}]}),/OUTPUT_INCOMPLETE/);
 assert.throws(()=>p.parseResponse('claude',{stop_reason:'end_turn',content:[{type:'text',text:'字'.repeat(16001)}]}));
 let mode='ok',count=0;const server=http.createServer((req,res)=>{count++;let text='';req.on('data',b=>text+=b);req.on('end',()=>{assert.equal(JSON.parse(text).model,'gpt-4.1-mini');if(mode==='timeout')return;if(mode==='redirect'){res.writeHead(302,{location:'/other'});return res.end();}if(mode==='large')return res.end('x'.repeat(262145));if(mode==='auth'){res.writeHead(401);return res.end('sk-fixture-only private');}res.end(JSON.stringify({status:'completed',output:[{type:'message',content:[{type:'output_text',text:'摘要'}]}]}));});});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const profile={...defaults.openai,baseUrl:'http://127.0.0.1:'+server.address().port,secret:'sk-fixture-only'};
 try{assert.equal((await requestSummary(profile,'原文','standard')).text,'摘要');for(const [m,code]of [['auth','AUTH_FAILED'],['redirect','NETWORK_ERROR'],['large','RESPONSE_TOO_LARGE'],['timeout','NETWORK_TIMEOUT']]){mode=m;await assert.rejects(requestSummary(profile,'原文','standard',{timeoutMs:60}),e=>e.message===code);}assert.equal(count,5);}finally{server.closeAllConnections();await new Promise(r=>server.close(r));}
 console.log('PASS AI protocol defaults, validation, bounded transport and safe errors');
})().catch(e=>{console.error(e);process.exitCode=1});
