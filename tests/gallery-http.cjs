const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');const {Readable}=require('node:stream');const {EventEmitter}=require('node:events');
const mod=path.resolve('native/gallery-http.cjs');assert.ok(fs.existsSync(mod),'Pinned gallery HTTP transport is missing');const {fetchImage}=require(mod);
const root=path.resolve('work/gallery-http-'+Date.now());fs.mkdirSync(root,{recursive:true});
function fixture(routes,addresses=['93.184.216.34']){
 const calls=[];let resolutions=0;
 return {calls,get resolutions(){return resolutions},lookup:async()=>{resolutions++;return addresses.map(address=>({address,family:address.includes(':')?6:4}))},request:(url,options,callback)=>{
  const req=new EventEmitter();req.destroy=()=>{};req.end=()=>{options.lookup(url.hostname,{},(err,address,family)=>{
   if(err){req.emit('error',err);return}calls.push({url:url.href,address,family,headers:options.headers});
   const route=routes[url.href];if(!route){req.emit('error',new Error('Unexpected URL'));return}
   const res=Readable.from(route.body?[Buffer.from(route.body)]:[]);res.statusCode=route.status||200;res.headers=route.headers||{};callback(res);
  })};return req;
 }}
}
async function reject(fn){await assert.rejects(fn)}
(async()=>{
 for(const [mime,want] of [['image/jpeg','jpeg'],['image/gif','gif'],['image/png','png'],['image/bmp','bmp'],['image/svg+xml','svg'],['image/webp','webp'],['image/x-icon','ico'],['image/vnd.microsoft.icon','ico'],['image/tiff','tiff'],['image/avif','avif']]){
  const url='https://public.example/wrong.jpg?fmt=png';const f=fixture({[url]:{headers:{'content-type':mime+'; charset=utf-8','content-length':'100'}}});
  const metadata=await fetchImage({url,sourceKind:'webpage',method:'HEAD'},f);assert.equal(metadata.format,want,'MIME must override path and query');
 }
 for(const [url,want] of [['https://public.example/picture.TIF?cache=123','tiff'],['https://public.example/picture.jpg?fmt=avif','avif'],['https://public.example/picture.svg?cache=123','svg']]){
  const f=fixture({[url]:{headers:{}}});const metadata=await fetchImage({url,sourceKind:'webpage',method:'HEAD'},f);assert.equal(metadata.format,want,'Missing MIME should retain URL type hint');
 }
 {const url='https://public.example/picture.constructor';const f=fixture({[url]:{headers:{'content-type':'__proto__'}}});assert.equal((await fetchImage({url,sourceKind:'webpage',method:'HEAD'},f)).format,'','Unrecognized MIME and extension remain unknown')}
 let f=fixture({'https://public.example/image':{status:302,headers:{location:'https://cdn.example/a.png'}},'https://cdn.example/a.png':{headers:{'content-type':'image/png','content-length':'4'},body:[137,80,78,71]}});
 const dest=path.join(root,'image');const result=await fetchImage({url:'https://public.example/image',sourceKind:'webpage',method:'GET',destination:dest},f);
 assert.equal(result.format,'png');assert.equal(result.bytes,4);assert.equal(fs.readFileSync(dest).length,4);assert.equal(f.calls.length,2);assert.equal(f.resolutions,2);assert.equal(f.calls[0].address,'93.184.216.34');assert.equal(f.calls[1].address,'93.184.216.34');assert.ok(!f.calls.some(x=>x.headers.Cookie||x.headers.Authorization));
 f=fixture({'https://public.example/image':{status:302,headers:{location:'http://127.0.0.1/private'}}});await reject(()=>fetchImage({url:'https://public.example/image',sourceKind:'webpage',method:'HEAD'},f));assert.equal(f.calls.length,1);
 f=fixture({'https://public.example/image':{status:302,headers:{location:'/image'}}});await reject(()=>fetchImage({url:'https://public.example/image',sourceKind:'webpage',method:'HEAD'},f));assert.equal(f.calls.length,1);
 const routes={};for(let i=0;i<7;i++)routes['https://public.example/'+i]={status:302,headers:{location:'/'+(i+1)}};f=fixture(routes);await reject(()=>fetchImage({url:'https://public.example/0',sourceKind:'webpage',method:'HEAD'},f));assert.equal(f.calls.length,6);
 for(const ip of ['127.0.0.1','10.1.2.3','192.168.0.1','169.254.169.254','::1','::ffff:127.0.0.1','fc00::1','fe80::1']){f=fixture({},[ip]);await reject(()=>fetchImage({url:'https://public.example/image',sourceKind:'webpage',method:'HEAD'},f));assert.equal(f.calls.length,0)}
 f=fixture({},['93.184.216.34','127.0.0.1']);await reject(()=>fetchImage({url:'https://public.example/image',sourceKind:'webpage',method:'HEAD'},f));assert.equal(f.calls.length,0);
 f=fixture({'https://public.example/image':{headers:{'content-length':'33554433'}}});const large=path.join(root,'large');await reject(()=>fetchImage({url:'https://public.example/image',sourceKind:'webpage',method:'GET',destination:large},f));assert.ok(!fs.existsSync(large));
 // A trusted system proxy owns remote DNS, while URL checks still reject literal private targets.
 const net=require('node:net');let connectLine='',innerRequest='';const sockets=new Set();
 const proxy=net.createServer(socket=>{sockets.add(socket);socket.on('close',()=>sockets.delete(socket));let phase=0,text='';socket.on('data',chunk=>{text+=chunk.toString();if(!text.includes('\r\n\r\n'))return;if(phase===0){connectLine=text.split('\r\n')[0];text='';phase=1;socket.write('HTTP/1.1 200 Connection established\r\n\r\n')}else{innerRequest=text;socket.end('HTTP/1.1 200 OK\r\nContent-Type: image/png\r\nContent-Length: 4\r\nConnection: close\r\n\r\nPNG!')}})});
 await new Promise(resolve=>proxy.listen(0,'127.0.0.1',resolve));
 try{const proxyUrl='http://127.0.0.1:'+proxy.address().port;const proxied=await fetchImage({url:'http://public.example/image',sourceKind:'webpage',method:'HEAD',proxyUrl},{lookup:async()=>{throw new Error('Proxy path must delegate DNS')}});assert.equal(proxied.format,'png');assert.equal(connectLine,'CONNECT public.example:80 HTTP/1.1');assert.match(innerRequest,/Host: public.example/i);await assert.rejects(()=>fetchImage({url:'http://127.0.0.1/private',sourceKind:'webpage',method:'HEAD',proxyUrl}));}
 finally{for(const socket of sockets)socket.destroy();await new Promise(resolve=>proxy.close(resolve))}
 console.log('PASS pinned public DNS, safe redirects, loops/hop cap, private IPv4/IPv6 rejection, credential-free requests, download bounds and real trusted-proxy CONNECT');
})().catch(e=>{console.error(e);process.exitCode=1});
