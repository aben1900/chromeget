const fs=require('fs'),path=require('path'),http=require('http'),crypto=require('crypto'),assert=require('assert/strict'),{spawn}=require('child_process');
const root=path.resolve('work/engine-'+Date.now()),jobs=path.join(root,'video-jobs'),media=path.join(root,'media');fs.mkdirSync(media,{recursive:true});fs.mkdirSync(jobs,{recursive:true});fs.mkdirSync(path.join(root,'bin'));
for(const f of ['recovery.ps1','gallery-image.ps1','video.ps1','video-worker.ps1','transfer.ps1','transfer-probe.ps1','telemetry.ps1'])fs.copyFileSync('native/'+f,path.join(root,f));
const engineBin=path.resolve(process.env.NATIVE_TEST_BIN||'native/bin');
for(const f of fs.readdirSync(engineBin).filter(n=>/\.(exe|dll)$/.test(n)))fs.copyFileSync(path.join(engineBin,f),path.join(root,'bin',f));
fs.writeFileSync(path.join(root,'video-settings.json'),JSON.stringify({directory:path.join(root,'downloads'),maxActive:1,autoClassify:true,transferMode:'fast'}));
const ffmpeg=path.join(root,'bin','ffmpeg.exe'),data=crypto.randomBytes(5*1024*1024);let serving=0,peak=0;
function run(exe,args){return new Promise((resolve,reject)=>{let output='';const p=spawn(exe,args,{windowsHide:true,cwd:exe===ffmpeg?media:undefined});p.stdout.on('data',b=>output+=b);p.stderr.on('data',b=>output+=b);p.on('error',reject);p.on('close',c=>c?reject(Error(output)):resolve(output));});}
const harness=path.join(root,'call.ps1');fs.writeFileSync(harness,'\ufeff'+`param($MessageFile)
$ErrorActionPreference='Stop'
$env:PATH=(Join-Path $PSScriptRoot 'bin')+';'+$env:PATH
. (Join-Path $PSScriptRoot 'video.ps1')
Invoke-VideoAction (Read-VideoJson $MessageFile) | ConvertTo-Json -Depth 8 -Compress
`);
async function call(message){const file=path.join(root,crypto.randomUUID()+'.message.json');fs.writeFileSync(file,JSON.stringify(message));return JSON.parse(await run('powershell.exe',['-NoProfile','-ExecutionPolicy','Bypass','-File',harness,'-MessageFile',file]));}
const server=http.createServer((req,res)=>{
 const pathname=new URL(req.url,'http://localhost').pathname;
 if(pathname==='/redirect'){res.writeHead(302,{Location:'/range.bin'});res.end();return;}
 if(pathname==='/huge'){res.writeHead(206,{'Content-Range':'bytes 0-0/22082529760','Content-Length':1});res.end('a');return;}
 if(pathname==='/range.bin'||pathname==='/plain.bin'){
  const range=pathname==='/range.bin'?req.headers.range?.match(/bytes=(\d+)-(\d*)/):null;let start=range?+range[1]:0,end=range&&range[2]?Math.min(+range[2],data.length-1):data.length-1;
  res.writeHead(range?206:200,{'Content-Type':'application/octet-stream','Content-Length':end-start+1,'ETag':'"stable"',...(range?{'Content-Range':`bytes ${start}-${end}/${data.length}`}:{})});
  serving++;peak=Math.max(peak,serving);const timer=setInterval(()=>{let next=Math.min(start+32768,end+1);res.write(data.subarray(start,next));start=next;if(start>end)res.end();},10);res.on('close',()=>{clearInterval(timer);serving--;});return;
 }
 const f=path.join(media,path.basename(pathname));if(!fs.existsSync(f)){res.writeHead(404);res.end();return;}
 const bytes=fs.readFileSync(f);res.writeHead(200,{'Content-Length':bytes.length,'Content-Type':f.endsWith('.m3u8')?'application/vnd.apple.mpegurl':f.endsWith('.mpd')?'application/dash+xml':'application/octet-stream'});res.end(bytes);
});
async function complete(id,ms=90000){const start=Date.now();while(Date.now()-start<ms){const j=JSON.parse(fs.readFileSync(path.join(jobs,id+'.json')));if(j.state==='failed')throw Error(JSON.stringify(j));if(j.state==='completed')return j;await new Promise(r=>setTimeout(r,500));}throw Error('Job timed out: '+id);}
(async()=>{
 await run(ffmpeg,['-hide_banner','-loglevel','error','-f','lavfi','-i','testsrc=size=160x90:rate=10','-f','lavfi','-i','sine=frequency=440','-t','4','-c:v','libx264','-pix_fmt','yuv420p','-preset','ultrafast','-g','10','-c:a','aac',path.join(media,'sample.mp4')]);
 fs.writeFileSync(path.join(media,'key.bin'),crypto.randomBytes(16));fs.writeFileSync(path.join(media,'keyinfo'),'key.bin\n'+path.join(media,'key.bin')+'\n');
 await run(ffmpeg,['-hide_banner','-loglevel','error','-i',path.join(media,'sample.mp4'),'-c','copy','-hls_time','1','-hls_key_info_file',path.join(media,'keyinfo'),'-hls_playlist_type','vod',path.join(media,'encrypted.m3u8')]);
 await run(ffmpeg,['-hide_banner','-loglevel','error','-i',path.join(media,'sample.mp4'),'-c','copy','-f','dash','-seg_duration','1',path.join(media,'stream.mpd')]);
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${server.address().port}`;
 const range=await call({action:'video-file-probe',url:base+'/redirect'});assert.equal(range.rangeSupported,true);assert.equal(range.size,data.length);assert.equal(range.redirected,true);
 const plain=await call({action:'video-file-probe',url:base+'/plain.bin'});assert.equal(plain.rangeSupported,false);assert.equal(plain.size,data.length);
 const huge=await call({action:'video-file-probe',url:base+'/huge'});assert.equal(huge.size,22082529760);
 const first=await call({action:'video-file-start',url:base+'/range.bin',genericFile:true,filename:'range.bin',confirmed:true,checksum:crypto.createHash('sha256').update(data).digest('hex')});
 const second=await call({action:'video-file-start',url:base+'/plain.bin',genericFile:true,filename:'plain.bin',confirmed:true});
 const [a,b]=await Promise.all([complete(first.id),complete(second.id)]);
 for(const j of [a,b])assert.equal(crypto.createHash('sha256').update(fs.readFileSync(j.file)).digest('hex'),crypto.createHash('sha256').update(data).digest('hex'));
 assert.equal(a.probes[0].rangeSupported,true);assert.equal(b.probes[0].rangeSupported,false);assert.ok(b.directory.endsWith('其他'));assert.ok(peak>1);
 for(const file of ['encrypted.m3u8','stream.mpd']){
  const info=await call({action:'video-info',url:base+'/'+file,genericMedia:true});assert.ok(info.heights.length);
  const started=await call({action:'video-start',url:base+'/'+file,genericMedia:true,height:0,title:file});const done=await complete(started.id);assert.ok(done.validation?.includes('FFprobe'));assert.ok(fs.statSync(done.file).size>10000);
 }
 const audio=await call({action:'video-start',url:base+'/sample.mp4',genericMedia:true,height:0,mediaMode:'audio',audioFormat:'mp3',title:'Audio fixture'});
 const audioDone=await complete(audio.id);assert.ok(audioDone.file.endsWith('.mp3'));assert.ok(audioDone.directory.endsWith('音乐'));assert.ok(audioDone.validation.includes('audio'));
 const audioAgain=await call({action:'video-start',url:base+'/sample.mp4',genericMedia:true,height:0,mediaMode:'audio',audioFormat:'m4a',title:'Audio fixture'});assert.notEqual(audioAgain.id,audio.id);await complete(audioAgain.id);
 console.log('PASS Range/redirect/no-Range/22GB probe, generic SHA-256, serial queue drain, classification, AES-128 HLS and DASH download/merge/FFprobe');
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>{server.closeAllConnections?.();server.close();});
