const fs=require('fs'),vm=require('vm'),assert=require('assert/strict');
const data={},listeners={};let active={id:7,url:'https://example.com/watch',title:'test'};
const chrome={storage:{local:{get:async()=>({hoverDownloadEnabled:false})},onChanged:{addListener:f=>listeners.storage=f},session:{get:async key=>({[key]:structuredClone(data[key])}),set:async obj=>Object.assign(data,structuredClone(obj)),remove:async key=>delete data[key]}},webRequest:{onHeadersReceived:{addListener:fn=>listeners.headers=fn}},tabs:{get:async()=>active,query:async()=>[active],onRemoved:{addListener:fn=>listeners.removed=fn},onUpdated:{addListener:fn=>listeners.updated=fn}},permissions:{contains:async()=>true}};
let request;const ctx=vm.createContext({chrome,URL,console,crypto:require('crypto').webcrypto,webpageUrl:v=>v,native:async m=>(request=m,{ok:true})});
vm.runInContext(fs.readFileSync('extension/sniffer.js','utf8'),ctx);
const event=(tabId,url='https://cdn.test/video.mp4')=>({tabId,url,statusCode:200,responseHeaders:[{name:'Content-Type',value:'video/mp4'},{name:'Set-Cookie',value:'NEVER_STORE_SECRET'}]});
(async()=>{
 listeners.headers(event(7));await ctx.sniffQueue(async()=>{});assert.equal(Object.keys(data).length,0);
 await ctx.sniffAction({action:'video-sniff-start',windowId:1});listeners.headers(event(8));listeners.headers(event(7));listeners.headers(event(7));await ctx.sniffQueue(async()=>{});
 let result=await ctx.sniffAction({action:'video-sniff-list',windowId:1});assert.equal(result.resources.length,1);assert.ok(!JSON.stringify(data).includes('NEVER_STORE_SECRET'));
 await ctx.sniffAction({action:'video-sniff-download',resourceId:result.resources[0].id});assert.equal(request.url,'https://cdn.test/video.mp4');assert.equal(request.confirmed,true);
 assert.equal(ctx.mediaKind('https://cdn.test/a.m3u8'),'manifest');assert.equal(ctx.mediaKind('https://cdn.test/a.m4s','video/mp4'),'');
 await ctx.sniffAction({action:'video-sniff-stop'});listeners.headers(event(7,'https://cdn.test/second.mp4'));await ctx.sniffQueue(async()=>{});assert.equal(data['sniff:7'].resources.length,1);
 listeners.updated(7,{url:'https://other.test'});await ctx.sniffQueue(async()=>{});assert.equal(data['sniff:7'].resources.length,0);
 listeners.storage({hoverDownloadEnabled:{newValue:true}},'local');
 listeners.headers(event(9,'https://cdn.test/auto.m3u8'));await ctx.sniffQueue(async()=>{});assert.equal(data['sniff:9'].auto,true);assert.equal(data['sniff:9'].resources.length,1);
 listeners.storage({hoverDownloadEnabled:{newValue:false}},'local');listeners.headers(event(9,'https://cdn.test/auto2.mp4'));await ctx.sniffQueue(async()=>{});assert.equal(data['sniff:9'].resources.length,1);
 console.log('PASS sniff opt-in, tab isolation, duplicate suppression, no cookie storage, direct dispatch, manifest detection, stop, navigation cleanup');
})().catch(e=>{console.error(e);process.exitCode=1;});
