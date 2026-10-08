const fs=require('fs'),path=require('path'),http=require('http'),assert=require('assert/strict'),{spawn}=require('child_process');
const root=path.resolve('work/setup-download-'+Date.now());fs.mkdirSync(root,{recursive:true});
const payload=Buffer.alloc(1024*1024,73);
let proxied=false;
const server=http.createServer((req,res)=>{
 if(req.url==='/slow'){res.setHeader('Content-Length',8*1024*1024);const timer=setInterval(()=>res.write(Buffer.alloc(1024)),100);res.on('close',()=>clearInterval(timer));return;}
 if(req.url.startsWith('http://download.invalid/'))proxied=true;
 if(req.url==='/broken'){res.writeHead(200,{'Content-Length':payload.length*2});res.end(payload);return;}
 if(req.url!=='/unknown')res.setHeader('Content-Length',payload.length);
 let offset=0;const timer=setInterval(()=>{if(offset===payload.length){clearInterval(timer);res.end();return;}res.write(payload.subarray(offset,offset+65536));offset+=65536;},50);
 res.on('close',()=>clearInterval(timer));
});
function download(url,name,proxy=''){
 const destination=path.join(root,name),quote=s=>"'"+s.replaceAll("'","''")+"'";
 const code=`[Console]::OutputEncoding=[Text.UTF8Encoding]::new($false); $ErrorActionPreference='Stop'; . ${quote(path.resolve('tools/setup-download.ps1'))}; Receive-SetupFile ${quote(url)} ${quote(destination)} 'test-engine'`;
 return new Promise((resolve,reject)=>{const p=spawn('powershell.exe',['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-OutputFormat','Text','-EncodedCommand',Buffer.from(code,'utf16le').toString('base64')],{windowsHide:true,env:{...process.env,HTTPS_PROXY:proxy,ALL_PROXY:''}});let output='';const timer=setTimeout(()=>{p.kill();reject(Error('Test timeout'));},45000);p.stdout.on('data',b=>output+=b);p.stderr.on('data',b=>output+=b);p.on('error',reject);p.on('close',code=>{clearTimeout(timer);resolve({code,output,destination});});});
}
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
 const known=await download(base+'/known','known');assert.equal(known.code,0,known.output);assert(fs.readFileSync(known.destination).equals(payload));assert.match(known.output,/JINGCAI_PROGRESS\|100\|/);assert.match(known.output,/JINGCAI_PROGRESS\|[1-9]\d?\|/);assert.match(known.output,/MiB\/s/);
 const unknown=await download(base+'/unknown','unknown');assert.equal(unknown.code,0,unknown.output);assert(fs.readFileSync(unknown.destination).equals(payload));assert(!unknown.output.includes('|100|'));assert(unknown.output.includes('|-1|'));
 const proxy=await download('http://download.invalid/test','proxy',base);assert.equal(proxy.code,0,proxy.output);assert(proxied);assert(fs.readFileSync(proxy.destination).equals(payload));
 const broken=await download(base+'/broken','broken');assert.notEqual(broken.code,0,'Incomplete response accepted');
 const slow=await download(base+'/slow','slow');assert.notEqual(slow.code,0,'Slow source not rejected');assert.match(slow.output,/64 KiB\/s/);
 console.log('PASS real streamed progress, unknown length, explicit HTTP proxy, byte integrity, incomplete transfer rejection');
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>server.close());
