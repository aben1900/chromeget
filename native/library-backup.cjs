'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const model=require('./library-backup-model.cjs');
const FILES={journal:'摘录数据.json',index:'资料库索引.json'},MARKER='.jingcai-restore-transaction.json';
const origin=ctx=>model.hash(path.resolve(ctx.directory).toLowerCase());
const noLinks=p=>require('./library.cjs').noLinks(p);
function writeRaw(p,value){noLinks(p);fs.mkdirSync(path.dirname(p),{recursive:true});const tmp=p+'.'+crypto.randomUUID()+'.tmp';let fd;try{fd=fs.openSync(tmp,'wx');fs.writeFileSync(fd,value,'utf8');fs.fsyncSync(fd);fs.closeSync(fd);fd=undefined;fs.renameSync(tmp,p);}finally{if(fd!==undefined)fs.closeSync(fd);if(fs.existsSync(tmp))fs.unlinkSync(tmp);}}
function json(p,v){writeRaw(p,JSON.stringify(v));}
function readPair(ctx){const pair={};for(const [k,n] of Object.entries(FILES)){const p=noLinks(path.join(ctx.directory,n));if(fs.existsSync(p)&&fs.statSync(p).size>model.MAX_BYTES)throw Error('资料文件超过 100 MiB');pair[k]=fs.existsSync(p)?fs.readFileSync(p,'utf8'):null;}return pair;}
const parse=s=>JSON.parse(s.replace(/^\uFEFF/,''));
function snapshotPair(raw,ctx){const index=raw.index===null?{schemaVersion:1,tags:[],collections:[],annotations:{},downloads:{}}:parse(raw.index),records=raw.journal===null?[]:parse(raw.journal);return model.validateSnapshot({records,index,exists:{journal:raw.journal!==null,index:raw.index!==null},origin:origin(ctx)});}
const fingerprint=raw=>model.hash(model.canonical(raw));
function statePath(ctx,kind,id){if(!model.UUID.test(id))throw Error('备份操作编号无效');const p=noLinks(path.join(ctx.directory,'.jingcai-backup-state',kind+'-'+id+'.json'));return p;}
function receipt(ctx,id){const p=statePath(ctx,'receipt',id);return fs.existsSync(p)?parse(fs.readFileSync(p,'utf8')):null;}
function restoreRaw(ctx,raw){for(const [k,n] of Object.entries(FILES)){const p=noLinks(path.join(ctx.directory,n));if(raw[k]===null){if(fs.existsSync(p))fs.unlinkSync(p);}else writeRaw(p,raw[k]);}}
function recover(ctx){const p=noLinks(path.join(ctx.directory,MARKER));if(!fs.existsSync(p))return {recovered:false};if(fs.statSync(p).size>model.MAX_BYTES*4)throw Error('恢复事务过大，请保留文件并检查');const t=parse(fs.readFileSync(p,'utf8'));if(t.version!==1||t.origin!==origin(ctx)||!model.UUID.test(t.id)||!['pending','committed'].includes(t.phase)||!t.before||!t.after||!t.result||t.beforeHash!==fingerprint(t.before)||t.afterHash!==fingerprint(t.after))throw Error('恢复事务校验失败，已停止操作，请保留事务文件');
 for(const k of Object.keys(FILES))if(![t.before[k],t.after[k]].every(v=>v===null||typeof v==='string'))throw Error('恢复事务字段损坏');
 const current=readPair(ctx);for(const k of Object.keys(FILES))if(current[k]!==t.before[k]&&current[k]!==t.after[k])throw Error('恢复事务期间资料被修改，已停止操作以保留资料');
 if(t.phase==='pending')restoreRaw(ctx,t.before);else{if(fingerprint(current)!==t.afterHash)throw Error('已提交恢复的资料校验失败');json(statePath(ctx,'receipt',t.id),t.result);}
 fs.unlinkSync(p);return {recovered:true};
}
function commitPair(ctx,id,before,next,result,hooks={}){recover(ctx);if(fingerprint(readPair(ctx))!==fingerprint(before))throw Error('资料已变化，请重新预览');model.validateSnapshot(next);statePath(ctx,'receipt',id);const after={journal:JSON.stringify(next.records,null,2),index:JSON.stringify(next.index,null,2)},p=path.join(ctx.directory,MARKER);const transaction={version:1,origin:origin(ctx),id,phase:'pending',before,after,beforeHash:fingerprint(before),afterHash:fingerprint(after),result};let committed=false;
 try{json(p,transaction);hooks.afterPending?.();writeRaw(path.join(ctx.directory,FILES.journal),after.journal);hooks.afterJournal?.();writeRaw(path.join(ctx.directory,FILES.index),after.index);hooks.afterIndex?.();transaction.phase='committed';json(p,transaction);committed=true;hooks.afterCommitted?.();json(statePath(ctx,'receipt',id),result);hooks.afterReceipt?.();hooks.beforeCleanup?.();fs.unlinkSync(p);return result;}catch(e){if(!committed)recover(ctx);throw e;}
}
module.exports={readPair,snapshotPair,recover,commitPair,writeRaw,json,origin,fingerprint,statePath,receipt};
