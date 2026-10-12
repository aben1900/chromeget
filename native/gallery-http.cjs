'use strict';
const http=require('node:http');const https=require('node:https');const dns=require('node:dns').promises;const net=require('node:net');const fs=require('node:fs');
const tls=require('node:tls');
const LIMIT=32*1024*1024;const blocked=new net.BlockList();
for(const [address,prefix] of [['0.0.0.0',8],['10.0.0.0',8],['100.64.0.0',10],['127.0.0.0',8],['169.254.0.0',16],['172.16.0.0',12],['192.0.0.0',24],['192.0.2.0',24],['192.168.0.0',16],['192.88.99.0',24],['198.18.0.0',15],['198.51.100.0',24],['203.0.113.0',24],['224.0.0.0',3]])blocked.addSubnet(address,prefix,'ipv4');
const public6=new net.BlockList();public6.addSubnet('2000::',3,'ipv6');
for(const [address,prefix] of [['2001::',23],['2001:db8::',32],['2002::',16]])blocked.addSubnet(address,prefix,'ipv6');
function assertPublic(address){const family=net.isIP(address);if(family===4&&!blocked.check(address,'ipv4'))return;if(family===6&&public6.check(address,'ipv6')&&!blocked.check(address,'ipv6'))return;throw new Error('不允许访问本机、内网或保留网络地址。')}
function validateUrl(value,sourceKind){
 const url=new URL(value);const host=url.hostname.replace(/^\[|\]$/g,'').replace(/\.$/,'').toLowerCase();
 if(value.length>8192||!['http:','https:'].includes(url.protocol)||url.username||url.password||url.port)throw new Error('网页图片地址无效。');
 if(sourceKind==='xiaohongshu'){if(url.protocol!=='https:'||!/(^|\.)xhscdn\.com$/.test(host))throw new Error('图集图片地址无效。')}
 else if(sourceKind!=='webpage')throw new Error('图集来源无效。');
 if(net.isIP(host))assertPublic(host);else if(!host.includes('.')||/(^|\.)(localhost|local|internal|lan|home|test|invalid|onion)$/.test(host))throw new Error('不允许访问本机或内网地址。');
 url.hash='';return url;
}
function format(headers,url){
 const mime=String(headers['content-type']||'').split(';')[0].trim().toLowerCase();
 const types={'image/jpeg':'jpeg','image/jpg':'jpeg','image/pjpeg':'jpeg','image/png':'png','image/webp':'webp','image/gif':'gif','image/bmp':'bmp','image/x-ms-bmp':'bmp','image/svg+xml':'svg','image/x-icon':'ico','image/vnd.microsoft.icon':'ico','image/tiff':'tiff','image/x-tiff':'tiff','image/avif':'avif'};
 if(Object.hasOwn(types,mime))return types[mime];
 const aliases={jpg:'jpeg',jpeg:'jpeg',gif:'gif',png:'png',bmp:'bmp',svg:'svg',webp:'webp',ico:'ico',tif:'tiff',tiff:'tiff',avif:'avif'};
 for(const [key,value] of url.searchParams)if(/^(fmt|format|fm|ext)$/i.test(key)&&Object.hasOwn(aliases,value.toLowerCase()))return aliases[value.toLowerCase()];
 const ext=/\.([a-z0-9]+)$/i.exec(url.pathname)?.[1]?.toLowerCase();return Object.hasOwn(aliases,ext)?aliases[ext]:'';
}
function proxyAgent(proxyValue,url,signal){
 const proxy=new URL(proxyValue);if(!['http:','https:'].includes(proxy.protocol)||proxy.username||proxy.password)throw new Error('系统代理配置不受支持。');
 const secure=url.protocol==='https:';const host=url.hostname.replace(/^\[|\]$/g,'');const authority=url.hostname+':'+(url.port||(secure?443:80));
 const agent=new (secure?https.Agent:http.Agent)({keepAlive:false});
 agent.createConnection=(_options,callback)=>{
  let settled=false;const done=(error,socket)=>{if(settled)return;settled=true;callback(error,socket)};
  const request=(proxy.protocol==='https:'?https.request:http.request)(proxy,{method:'CONNECT',path:authority,headers:{Host:authority},agent:false,signal});
  request.on('error',()=>done(new Error('系统代理连接失败。')));
  request.on('connect',(response,socket,head)=>{
   if(response.statusCode!==200){socket.destroy();done(new Error('系统代理拒绝图片连接。'));return}
   if(head.length)socket.unshift(head);
   const abort=()=>socket.destroy();signal.addEventListener('abort',abort,{once:true});socket.once('close',()=>signal.removeEventListener('abort',abort));
   if(secure){const encrypted=tls.connect({socket,host,servername:net.isIP(host)?undefined:host,rejectUnauthorized:true});encrypted.once('secureConnect',()=>done(null,encrypted));encrypted.once('error',()=>done(new Error('图片安全连接失败。')))}
   else done(null,socket);
  });request.end();
 };
 return agent;
}
async function fetchImage(input,deps={}){
 if(!['GET','HEAD'].includes(input.method))throw new Error('图片请求方法无效。');
 const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),input.method==='HEAD'?8000:60000);const seen=new Set();let file=null;let created=false;
 try{
  let url=validateUrl(input.url,input.sourceKind);
  for(let hop=0;hop<=5;hop++){
   if(seen.has(url.href))throw new Error('图片地址发生循环跳转。');seen.add(url.href);
   const host=url.hostname.replace(/^\[|\]$/g,'');
   const records=input.proxyUrl?[]:net.isIP(host)?[{address:host,family:net.isIP(host)}]:await Promise.race([
    (deps.lookup||dns.lookup)(host,{all:true,verbatim:true}),
    new Promise((_,reject)=>{if(controller.signal.aborted)reject(new Error('图片请求超时。'));else controller.signal.addEventListener('abort',()=>reject(new Error('图片请求超时。')),{once:true})})
   ]);
   if(!input.proxyUrl&&!records.length)throw new Error('图片域名无法解析。');for(const record of records)assertPublic(record.address);
   const lookup=(_hostname,options,callback)=>{if(options?.all)callback(null,records);else callback(null,records[0].address,records[0].family)};
   const agent=input.proxyUrl?proxyAgent(input.proxyUrl,url,controller.signal):false;
   const response=await new Promise((resolve,reject)=>{
    const headers={'User-Agent':'Mozilla/5.0','Accept':'image/*','Accept-Encoding':'identity'};if(input.sourceKind==='xiaohongshu')headers.Referer='https://www.xiaohongshu.com/';
    const request=(deps.request||(url.protocol==='https:'?https.request:http.request))(url,{method:input.method,headers,lookup,agent,signal:controller.signal,maxHeaderSize:32768},resolve);
    request.on('error',()=>reject(new Error('图片网络请求失败。')));request.end();
   });
   const status=response.statusCode;
   if([301,302,303,307,308].includes(status)){
    response.destroy();if(hop===5||!response.headers.location)throw new Error('图片跳转次数过多或地址无效。');
    url=validateUrl(new URL(response.headers.location,url).href,input.sourceKind);continue;
   }
   if(status<200||status>=300){response.destroy();throw new Error('图片服务器未返回成功响应。')}
   const length=Number(response.headers['content-length']);const bytes=Number.isSafeInteger(length)&&length>=0?length:null;const info={ok:true,format:format(response.headers,url),bytes};
   if(input.method==='HEAD'){response.destroy();return info}
   if(bytes>LIMIT){response.destroy();throw new Error('单张图片超过 32 MB 限制。')}
   try{file=await fs.promises.open(input.destination,'wx');created=true}catch(error){response.destroy();throw error}
   let count=0;
   try{for await(const chunk of response){count+=chunk.length;if(count>LIMIT)throw new Error('单张图片超过 32 MB 限制。');await file.write(chunk)}}finally{response.destroy()}
   await file.close();file=null;return {...info,bytes:count};
  }
 }catch(error){if(file)await file.close().catch(()=>{});if(created)await fs.promises.unlink(input.destination).catch(()=>{});throw error}
 finally{clearTimeout(timer)}
}
module.exports={fetchImage,validateUrl,assertPublic};
if(require.main===module){let input='';process.stdin.setEncoding('utf8');process.stdin.on('data',chunk=>{input+=chunk;if(input.length>65536)process.exit(1)});process.stdin.on('end',async()=>{try{const result=await fetchImage(JSON.parse(input));process.stdout.write(JSON.stringify(result))}catch(error){process.stdout.write(JSON.stringify({ok:false,error:/[\u4e00-\u9fff]/.test(error.message)?error.message:'图片网络请求失败。'}));process.exitCode=1}})}
