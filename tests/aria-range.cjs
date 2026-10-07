const http=require('http'),fs=require('fs'),path=require('path'),{spawn}=require('child_process'),crypto=require('crypto'),assert=require('assert/strict');
const root=path.resolve('work/aria-range-'+Date.now());fs.mkdirSync(root,{recursive:true});
const buffer=crypto.randomBytes(24*1024*1024),hash=crypto.createHash('sha256').update(buffer).digest('hex');let active=0,max=0,ranges=0;
const server=http.createServer((req,res)=>{
 const match=req.headers.range?.match(/bytes=(\d+)-(\d*)/);const start=match?+match[1]:0,end=match&&match[2]?Math.min(+match[2],buffer.length-1):buffer.length-1;
 if(match)ranges++;if(start>=buffer.length){res.writeHead(416);res.end();return;}
 res.writeHead(match?206:200,{'Content-Type':'video/mp4','Accept-Ranges':'bytes','Content-Length':end-start+1,...(match?{'Content-Range':`bytes ${start}-${end}/${buffer.length}`}:{})});
 active++;max=Math.max(max,active);let offset=start;const timer=setInterval(()=>{const stop=Math.min(offset+32768,end+1);res.write(buffer.subarray(offset,stop));offset=stop;if(offset>end)res.end();},60);
 res.on('close',()=>{clearInterval(timer);active--;});
});
function run(url,interrupt){return new Promise((resolve,reject)=>{
 const child=spawn(path.resolve('native/bin/aria2c.exe'),['--continue=true','--split=32','--max-connection-per-server=16','--min-split-size=1M','--file-allocation=none','--auto-save-interval=1','--auto-file-renaming=false','--check-integrity=true','--checksum=sha-256='+hash,'--dir='+root,'--out=payload.bin',url],{windowsHide:true});
 let log='';child.stdout.on('data',b=>log+=b);child.stderr.on('data',b=>log+=b);const timer=interrupt?setTimeout(()=>child.kill(),1500):null;
 child.on('error',reject);child.on('close',code=>{clearTimeout(timer);resolve({code,log});});
});}
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const url=`http://127.0.0.1:${server.address().port}/payload`;
 const first=await run(url,true);assert.ok(fs.existsSync(path.join(root,'payload.bin.aria2')),'piece map must survive interruption: '+first.log);
 const result=await run(url,false);assert.equal(result.code,0,result.log);assert.equal(crypto.createHash('sha256').update(fs.readFileSync(path.join(root,'payload.bin'))).digest('hex'),hash);assert.ok(max>1,'must use multiple connections');assert.ok(ranges>1);
 const videoResult=await new Promise((resolve,reject)=>{const child=spawn(path.resolve('native/bin/yt-dlp.exe'),['--ignore-config','--proxy','','--no-playlist','--force-generic-extractor','--downloader','http,https:'+path.resolve('native/bin/aria2c.exe'),'--downloader-args','aria2c:-x 16 -s 32 -k 1M --file-allocation=none','--concurrent-fragments','16','-o',path.join(root,'video.mp4'),'--',url+'.mp4'],{windowsHide:true});let log='';child.stdout.on('data',b=>log+=b);child.stderr.on('data',b=>log+=b);child.on('error',reject);child.on('close',code=>resolve({code,log}));});
 assert.equal(videoResult.code,0,videoResult.log);assert.equal(crypto.createHash('sha256').update(fs.readFileSync(path.join(root,'video.mp4'))).digest('hex'),hash);console.log('PASS yt-dlp HTTP video delegates to aria2 with parallel flags and exact downloaded content');
 console.log(`PASS real aria2 parallel transfer and interrupted resume: peak ${max} concurrent connections, ${ranges} range requests, SHA-256 verified`);
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>server.closeAllConnections?.()||server.close());
