'use strict';
// Developer verification: fixed short probes only; never prints credentials or response text.
const fs=require('node:fs'),path=require('node:path'),{spawn}=require('node:child_process');
const allowed=new Set(['ai-settings-get','ai-model-import-preview','ai-model-import-apply','ai-test']);
function callNative(host,message){if(!allowed.has(message.action))throw Error('ACTION_NOT_ALLOWED');return new Promise((resolve,reject)=>{
 const p=spawn('powershell.exe',['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',host],{windowsHide:true});const chunks=[];let size=0;const timer=setTimeout(()=>{p.kill();reject(Error('HOST_TIMEOUT'))},65000);
 p.stdout.on('data',b=>{size+=b.length;if(size>2097152){p.kill();return}chunks.push(b)});p.stderr.resume();p.on('error',reject);p.on('close',()=>{clearTimeout(timer);try{const b=Buffer.concat(chunks);const n=b.readUInt32LE();if(n!==b.length-4)throw Error();resolve(JSON.parse(b.subarray(4).toString('utf8')))}catch{reject(Error('HOST_RESPONSE_INVALID'))}});const payload=Buffer.from(JSON.stringify(message)),head=Buffer.alloc(4);head.writeUInt32LE(payload.length);p.stdin.end(Buffer.concat([head,payload]));
});}
async function main(){const host=path.resolve(process.argv[2]||'native/host.ps1'),output=path.resolve(process.argv[3]||'work/model-connectivity.json');
 if(process.argv.includes('--import-workbuddy')){const preview=await callNative(host,{action:'ai-model-import-preview',source:'workbuddy'});if(!preview.ok)throw Error(preview.code);const ids=preview.items.filter(p=>p.change==='add'&&!p.conflict).map(p=>p.candidateId);const saved=await callNative(host,{action:'ai-model-import-apply',previewId:preview.previewId,candidateIds:ids});if(!saved.ok)throw Error(saved.code);console.log('Imported '+ids.length+' models; existing configurations retained.');}
 const settings=await callNative(host,{action:'ai-settings-get'});if(!settings.ok)throw Error(settings.code);const rows=Object.values(settings.profiles).filter(p=>p.hasKey&&p.baseUrl==='https://aigateway.smec-cn.com/v1'&&p.protocol==='chat-completions');const report=[];let index=0;
 async function worker(){while(index<rows.length){const p=rows[index++],started=Date.now();let result;try{result=await callNative(host,{action:'ai-test',profileId:p.profileId,expectedRevision:p.revision,confirmed:true})}catch(e){result={ok:false,code:e.message}}const row={label:p.label,model:p.model,ok:result.ok===true,code:result.code||'UNKNOWN',elapsedMs:Date.now()-started};report.push(row);console.log(JSON.stringify(row));fs.mkdirSync(path.dirname(output),{recursive:true});fs.writeFileSync(output,JSON.stringify({testedAt:new Date().toISOString(),results:report},null,2));}}
 await Promise.all([worker(),worker()]);console.log('Completed '+report.length+' fixed-message tests; '+report.filter(p=>p.ok).length+' passed.');
}
if(require.main===module)main().catch(e=>{console.error(/^[A-Z_]+$/.test(e.message)?e.message:'VERIFICATION_FAILED');process.exitCode=1});
module.exports={callNative};
