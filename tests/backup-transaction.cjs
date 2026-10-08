const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{randomUUID}=require('node:crypto'),{spawnSync}=require('node:child_process');
const {readPair,snapshotPair,commitPair,recover}=require('../native/library-backup.cjs');
const root=path.resolve('work/backup-transactions-'+Date.now());fs.mkdirSync(root,{recursive:true});const ctx={root,directory:root};
const before={journal:null,index:null},next=snapshotPair(before,ctx);next.records=[{id:randomUUID(),type:'内容',time:new Date().toISOString(),content:'恢复中文'}];next.exists={journal:true,index:true};
for(const point of ['afterPending','afterJournal','afterIndex']){assert.throws(()=>commitPair(ctx,randomUUID(),before,next,{ok:true},{[point]:()=>{throw Error('injected')}}),/injected/);assert.deepEqual(readPair(ctx),before);recover(ctx);assert.deepEqual(readPair(ctx),before);}
const id=randomUUID();assert.throws(()=>commitPair(ctx,id,before,next,{ok:true},{afterCommitted:()=>{throw Error('after commit')}}),/after commit/);recover(ctx);assert.equal(JSON.parse(readPair(ctx).journal)[0].content,'恢复中文');assert.equal(recover(ctx).recovered,false);
const prior=readPair(ctx),next2=structuredClone(next);next2.records[0].content='不应保留';
const script=`const b=require(${JSON.stringify(path.resolve('native/library-backup.cjs'))});b.commitPair(${JSON.stringify(ctx)},${JSON.stringify(randomUUID())},${JSON.stringify(prior)},${JSON.stringify(next2)},{ok:true},{afterJournal:()=>process.kill(process.pid)});`;
const child=spawnSync(process.execPath,['-e',script]);assert.notEqual(child.status,0);recover(ctx);assert.deepEqual(readPair(ctx),prior);
fs.writeFileSync(path.join(root,'.jingcai-restore-transaction.json'),'{broken');assert.throws(()=>recover(ctx));assert.ok(fs.existsSync(path.join(root,'.jingcai-restore-transaction.json')));assert.deepEqual(readPair(ctx),prior);
console.log('PASS backup transaction failures, absent-file rollback, committed recovery, real process termination and invalid marker protection');
// Neither journal overflow nor transaction overhead may make rollback unreadable.
fs.unlinkSync(path.join(root,'.jingcai-restore-transaction.json'));
const huge=structuredClone(next);huge.records[0].content='x'.repeat(104857600);
assert.throws(()=>commitPair(ctx,randomUUID(),prior,huge,{ok:true}),/100 MiB/);
assert.deepEqual(readPair(ctx),prior);assert.equal(fs.existsSync(path.join(root,'.jingcai-restore-transaction.json')),false);

for(const point of ['afterReceipt','beforeCleanup']){const raw=readPair(ctx),id=randomUUID();assert.throws(()=>commitPair(ctx,id,raw,next,{ok:true},{[point]:()=>{throw Error('committed failure')}}),/committed failure/);recover(ctx);assert.equal(require('../native/library-backup.cjs').receipt(ctx,id).ok,true);}
const clean=readPair(ctx);assert.throws(()=>commitPair(ctx,randomUUID(),clean,next2,{ok:true},{afterJournal:()=>{fs.writeFileSync(path.join(root,'摘录数据.json'),'external change');throw Error('failed');}}),/资料被修改/);assert.ok(fs.existsSync(path.join(root,'.jingcai-restore-transaction.json')));fs.writeFileSync(path.join(root,'摘录数据.json'),JSON.stringify(next2.records,null,2));recover(ctx);assert.deepEqual(readPair(ctx),clean);
