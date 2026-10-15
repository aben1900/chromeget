// Read-only check of the registered launcher's installed copy. Never deletes data.
const fs = require('node:fs');
const path = require('node:path');
const {spawn} = require('node:child_process');
const manifest = JSON.parse(fs.readFileSync(path.join(process.env.LOCALAPPDATA,'JingcaiClipper/host.json')));
function call(message) {
  return new Promise((resolve,reject) => {
    const child=spawn(process.env.ComSpec,['/d','/c',manifest.path],{windowsHide:true});
    const parts=[]; let stderr='';
    child.stdout.on('data',b=>parts.push(b)); child.stderr.on('data',b=>stderr+=b);
    child.on('error',reject); child.on('close',code=>{
      try {
        const bytes=Buffer.concat(parts);
        if(code || bytes.length<4 || bytes.readUInt32LE(0)!==bytes.length-4) throw Error(stderr || 'Invalid native response');
        const result=JSON.parse(bytes.subarray(4));
        if(!result.ok) throw Error(result.error);
        resolve(result);
      }catch(error){reject(error);}
    });
    const body=Buffer.from(JSON.stringify(message)),header=Buffer.alloc(4);header.writeUInt32LE(body.length);
    child.stdin.end(Buffer.concat([header,body]));
  });
}
(async()=>{
  const status=await call({action:'status'});
  const installedVersion=String(status.version||'').split('.').map(Number);
  if(status.storageFormat!=='json'||installedVersion.length!==3||installedVersion.some(n=>!Number.isInteger(n))||installedVersion[0]!==1||installedVersion[1]<20)throw Error('Installed host must be JSON-only v1.20.0 or newer');
  if(!status.path.endsWith('.json'))throw Error('Save path must be JSON');
  const video=await call({action:'video-status'});
  if(!video.directory)throw Error('Video backend unavailable');
  const result=await call({action:'list',journalPath:process.argv[2],offset:0});
  if(!Array.isArray(result.records))throw Error('Records must be an array');
  for(const record of result.records)if(typeof record!=='object'||!record.id||typeof record.preview!=='string')throw Error('Invalid record shape');
  if(result.records.length)await call({action:'read',journalPath:process.argv[2],id:result.records[0].id,offset:0});
  console.log(JSON.stringify({ok:true,version:status.version,journalPath:result.journalPath,total:result.total,readVerified:result.records.length>0}));
})().catch(error=>{console.error(error.message);process.exitCode=1;});
