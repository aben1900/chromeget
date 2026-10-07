const http=require('http'),fs=require('fs'),path=require('path'),{spawn}=require('child_process'),crypto=require('crypto'),assert=require('assert/strict');
const root=path.resolve('work/progress-'+Date.now()),jobs=path.join(root,'video-jobs');fs.mkdirSync(jobs,{recursive:true});
for(const name of ['video.ps1','video-worker.ps1','telemetry.ps1'])fs.copyFileSync('native/'+name,path.join(root,name));
const payload=crypto.randomBytes(32*1024*1024),sha=crypto.createHash('sha256').update(payload).digest('hex');
const server=http.createServer((req,res)=>{const m=req.headers.range?.match(/bytes=(\d+)-(\d*)/);let offset=m?+m[1]:0;const end=m&&m[2]?Math.min(+m[2],payload.length-1):payload.length-1;res.writeHead(m?206:200,{'Accept-Ranges':'bytes','Content-Length':end-offset+1,...(m?{'Content-Range':`bytes ${offset}-${end}/${payload.length}`}:{})});const t=setInterval(()=>{const next=Math.min(offset+16384,end+1);res.write(payload.subarray(offset,next));offset=next;if(offset>end)res.end();},45);res.on('close',()=>clearInterval(t));});
const id=crypto.randomBytes(16).toString('hex'),jobPath=path.join(jobs,id+'.json'),out=path.join(root,'payload.bin');
function ps(args){return new Promise((resolve,reject)=>{const child=spawn('powershell.exe',['-NoProfile','-ExecutionPolicy','Bypass',...args],{windowsHide:true});let output='';child.stdout.on('data',d=>output+=d);child.stderr.on('data',d=>output+=d);child.on('error',reject);child.on('close',code=>code?reject(Error(output)):resolve(output));});}
function action(name){return ps(['-Command',`. '${path.join(root,'video.ps1').replace(/'/g,"''")}'; Invoke-VideoAction ([pscustomobject]@{action='${name}';id='${id}'}) | ConvertTo-Json -Depth 8`]);}
async function until(fn,ms=45000){const start=Date.now();while(Date.now()-start<ms){const r=fn();if(r)return r;await new Promise(r=>setTimeout(r,250));}throw Error('Timed out: '+fs.readFileSync(jobPath,'utf8')+'\n'+(fs.existsSync(path.join(jobs,id+'.error.log'))?fs.readFileSync(path.join(jobs,id+'.error.log'),'utf8'):''));}
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 fs.writeFileSync(jobPath,JSON.stringify({kind:'files',state:'starting',directory:root,engine:path.resolve('native/bin/aria2c.exe'),arguments:['--continue=true','--split=8','--max-connection-per-server=8','--min-split-size=1M','--file-allocation=none','--auto-save-interval=1','--dir='+root,'--out=payload.bin',`http://127.0.0.1:${server.address().port}/file`],expectedFiles:[out],expectedSizes:[payload.length],error:'',file:''}));
 const worker=ps(['-File',path.join(root,'video-worker.ps1'),'-JobPath',jobPath]).catch(()=>{});
 const metricsPath=path.join(jobs,id+'.metrics.json');
 const metrics=await until(()=>{if(!fs.existsSync(metricsPath))return;const m=JSON.parse(fs.readFileSync(metricsPath));return m.completed>0&&m.connections>1&&m.files[0]?.groups?.some(g=>g.percent>0)?m:null;});
 assert.equal(metrics.total,payload.length);assert.ok(metrics.files[0].groups.length<=32);assert.ok(metrics.speed>0);
 await action('video-pause');await worker;const state=JSON.parse(await action('video-job'));assert.equal(state.state,'paused');assert.equal(state.canResume,true);assert.ok(fs.existsSync(out+'.aria2'));
 const resumed=JSON.parse(await action('video-resume'));assert.equal(resumed.id,id);
 await until(()=>JSON.parse(fs.readFileSync(jobPath)).state==='completed',60000);
 assert.equal(crypto.createHash('sha256').update(fs.readFileSync(out)).digest('hex'),sha);
 console.log('PASS live RPC bytes/speed/connections/piece map, pause retains control file, same-ID resume and final SHA-256');
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>{server.closeAllConnections?.();server.close();});
