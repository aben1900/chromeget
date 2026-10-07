const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const base={domain:'.bilibili.com',hostOnly:false,path:'/',secure:true,httpOnly:true,session:true,name:'SESSDATA',value:'synthetic'};
let query;
const context=vm.createContext({chrome:{tabs:{query:async()=>[{id:9}]},cookies:{getAllCookieStores:async()=>[{id:'wrong',tabIds:[1]},{id:'correct',tabIds:[9]}],getAll:async q=>{query=q;return [base];}}}});
vm.runInContext(fs.readFileSync('extension/browser-cookies.js','utf8'),context);
(async()=>{
 const text=context.biliCookieText([base,{...base,domain:'evilbilibili.com'},{...base,name:'expired',session:false,expirationDate:1},{...base,name:'partitioned',partitionKey:{topLevelSite:'https://example.com'}}]);
 assert.equal(text.split('\n').length,3);assert.ok(text.includes('#HttpOnly_.bilibili.com\tTRUE\t/\tTRUE\t0\tSESSDATA\tsynthetic'));
 assert.throws(()=>context.biliCookieText([]));assert.throws(()=>context.biliCookieText([{...base,value:'bad\nline'}]));
 await context.currentBiliCookies(7);assert.equal(query.storeId,'correct');assert.equal(query.domain,'bilibili.com');
 const xhs=context.biliCookieText([base,{...base,domain:'.xiaohongshu.com',name:'web_session'}],Date.now()/1000,'xiaohongshu');assert.ok(xhs.includes('web_session'));assert.ok(!xhs.includes('SESSDATA'));
 assert.throws(()=>context.biliCookieText([base],Date.now()/1000,'xiaohongshu'));
 const tt=context.biliCookieText([base,{...base,domain:'.toutiao.com',name:'ttwid'}],Date.now()/1000,'toutiao');assert.ok(tt.includes('ttwid'));assert.ok(!tt.includes('SESSDATA'));
 assert.throws(()=>context.biliCookieText([base],Date.now()/1000,'toutiao'));
 const yt=context.biliCookieText([base,{...base,domain:'.youtube.com',name:'SAPISID'}],Date.now()/1000,'youtube');assert.ok(yt.includes('SAPISID'));assert.ok(!yt.includes('SESSDATA'));assert.throws(()=>context.biliCookieText([base],Date.now()/1000,'youtube'));
 console.log('PASS Bilibili scope, cookie store isolation, HttpOnly/session serialization, expired/partitioned filtering, logged-out rejection');
})().catch(e=>{console.error(e);process.exitCode=1;});
