const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
assert.ok(fs.existsSync('extension/page-media.js'), 'current-page media collector must exist');
const code = fs.readFileSync('extension/page-media.js', 'utf8');
const expected = 'https://huggingface.co/jialinyyzz/humanizer';
function setup({tabUrl=expected, resultUrl=expected, afterUrl=tabUrl, activeAfter=true, denied=false,images=[{url:'https://cdn.example/content.png',width:500,height:400}]}={}) {
  const executions=[];
  const context=vm.createContext({URL, chrome:{
    tabs:{query:async query=>{assert.deepEqual(JSON.parse(JSON.stringify(query)),{active:true,windowId:7});return [{id:42,windowId:7,url:tabUrl,active:true}];},get:async id=>{assert.equal(id,42);return {id,windowId:7,url:afterUrl,active:activeAfter};}},
    scripting:{executeScript:async details=>{executions.push(details);if(denied)throw Error('Cannot access contents of url');return [{frameId:0,result:{url:resultUrl,title:'humanizer',images,videos:[]}}];}}
  }});
  vm.runInContext(code,context);return {context,executions};
}
(async()=>{
  let env=setup();let r=await env.context.collectPageMedia(7,expected+'#readme');
  assert.equal(r.ok,true);assert.equal(r.images[0].url,'https://cdn.example/content.png');
  assert.deepEqual(JSON.parse(JSON.stringify(env.executions[0].target)),{tabId:42,frameIds:[0]});
  for(const options of [{tabUrl:'https://other.example/'},{afterUrl:'https://other.example/'},{resultUrl:'https://other.example/'},{activeAfter:false}]){
    env=setup(options);r=await env.context.collectPageMedia(7,expected);assert.equal(r.ok,false);assert.match(r.error,/页面|标签/);
    if(options.tabUrl)assert.equal(env.executions.length,0);
  }
  for(const url of ['file:///secret','https://localhost/a','https://10.0.0.1/a','https://127.1/a','https://169.254.169.254/a','https://[::1]/a','https://[::ffff:7f00:1]/a','https://user:pass@example.com/a','https://example.com:8443/a']){
    env=setup({tabUrl:url});r=await env.context.collectPageMedia(7,url);assert.equal(r.ok,false,url);assert.equal(env.executions.length,0);
  }
  env=setup({denied:true});assert.match((await env.context.collectPageMedia(7,expected)).error,/授权|权限/);
  env=setup();assert.equal((await env.context.collectPageMedia(undefined,expected)).ok,false);assert.equal(env.executions.length,0);
  const svg='data:image/svg+xml;base64,'+Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M0 0h24v24z"/></svg>').toString('base64');
  env=setup({images:[{url:svg,width:24,height:24,format:'svg',unexpected:'discard'},{url:'data:image/png;base64,AAAA',format:'png'},{url:'blob:https://example.com/id',format:'svg'},{url:svg+'!',format:'svg'},{url:svg,format:'png'},{url:'https://127.0.0.1/private.svg',format:'svg'}]});
  r=await env.context.collectPageMedia(7,expected);assert.equal(r.images.length,1);assert.deepEqual(JSON.parse(JSON.stringify(r.images[0])),{url:svg,width:24,height:24,format:'svg'});
  const large='data:image/svg+xml;base64,'+Buffer.from('x'.repeat(128*1024+1)).toString('base64');
  env=setup({images:[{url:large,format:'svg'},{url:svg,format:'svg'}]});r=await env.context.collectPageMedia(7,expected);assert.equal(r.images.length,1);assert.equal(r.images[0].url,svg);
  const bounded='data:image/svg+xml;base64,'+Buffer.from('x'.repeat(100*1024)).toString('base64');
  env=setup({images:Array.from({length:8},()=>({url:bounded,format:'svg'}))});r=await env.context.collectPageMedia(7,expected);assert.ok(r.images.length>0 && r.images.length<8);assert.ok(r.images.reduce((sum,item)=>sum+item.url.length,0)<=512*1024);
  console.log('PASS page-media exact active window/tab, main frame, navigation checks, private URL and permission boundaries');
})().catch(error=>{console.error(error);process.exitCode=1;});
