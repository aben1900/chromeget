const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{spawn}=require('node:child_process'),{randomUUID}=require('node:crypto');
const root=path.resolve('work/bookmark-native-'+Date.now());fs.mkdirSync(root,{recursive:true});
for(const name of fs.readdirSync('native').filter(n=>/\.(ps1|cjs)$/.test(n)))fs.copyFileSync(path.join('native',name),path.join(root,name));
fs.writeFileSync(path.join(root,'config.json'),JSON.stringify({directory:root}));
function send(message){return new Promise((resolve,reject)=>{const p=spawn('powershell.exe',['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',path.join(root,'host.ps1')],{windowsHide:true});const out=[];p.stdout.on('data',b=>out.push(b));p.on('error',reject);p.on('close',()=>{try{resolve(JSON.parse(Buffer.concat(out).subarray(4)))}catch(e){reject(e)}});const b=Buffer.from(JSON.stringify(message)),h=Buffer.alloc(4);h.writeUInt32LE(b.length);p.stdin.end(Buffer.concat([h,b]));});}
(async()=>{
 const legacy={id:randomUUID(),time:new Date().toISOString(),type:'网页地址',content:'https://legacy.example/',futureField:{preserve:true}};
 const journal=path.join(root,'摘录数据.json');fs.writeFileSync(journal,JSON.stringify([legacy]));
 const record={id:randomUUID(),time:new Date().toISOString(),type:'网页地址',content:'https://target.example/article?token=secret&view=1',title:'研究资料',note:'只在备注出现的检索词\n```\n<img src=x>\n```',author:'李四',sourceUrl:'https://source.example/list',sourceTitle:'列表页'};
 assert.equal((await send({action:'save',record})).ok,true);
 let records=JSON.parse(fs.readFileSync(journal));assert.equal(records[1].title,'研究资料');assert.equal(records[1].note,record.note);assert.equal(records[1].author,'李四');assert.deepEqual(records[0],legacy);
 await send({action:'save',record:{...record,title:'重试不得覆盖',note:'丢失响应后的重试'}});records=JSON.parse(fs.readFileSync(journal));assert.equal(records.length,2);assert.equal(records[1].title,'研究资料');assert.equal(records[1].note,record.note);
 const list=await send({action:'list'});assert.equal(list.records[0].title,'研究资料');assert.equal(list.records[0].note,record.note);assert.equal(list.records[0].author,'李四');
 const read=await send({action:'read',id:record.id});assert.equal(read.content,record.content);assert.equal(read.title,record.title);assert.equal(read.note,record.note);assert.equal(read.author,record.author);
 assert.equal((await send({action:'read',id:legacy.id})).content,legacy.content);
 for(const invalid of [{title:''},{title:'x'.repeat(121)},{note:'x'.repeat(2001)},{author:'x'.repeat(121)}])assert.equal((await send({action:'save',record:{...record,id:randomUUID(),...invalid}})).ok,false);
 assert.equal(JSON.parse(fs.readFileSync(journal)).length,2);
 const Library=require('../native/library.cjs'),ctx={root,directory:root};
 const found=await Library.dispatch({action:'library-query',query:'只在备注出现的检索词'},ctx);assert.equal(found.total,1);assert.equal(found.items[0].title,record.title);
 const detail=await Library.dispatch({action:'library-read',id:'clip:'+record.id},ctx);assert.equal(detail.item.note,record.note);assert.equal(detail.item.author,record.author);
 for(const format of ['md','zip']){
  const plan=await Library.dispatch({action:'library-export-prepare',ids:['clip:'+record.id],format},ctx);const {id}=await Library.dispatch({action:'library-export-start',planId:plan.planId},ctx);let state;for(let i=0;i<100;i++){state=await Library.dispatch({action:'library-export-status',id},ctx);if(state.state!=='running')break;await new Promise(r=>setTimeout(r,50));}assert.equal(state.state,'completed',JSON.stringify(state));
  const bytes=fs.readFileSync(state.file).toString('utf8');assert.ok(bytes.includes('研究资料'));assert.ok(bytes.includes('只在备注出现的检索词'));assert.ok(bytes.includes('李四'));assert.ok(bytes.includes('https://target.example/article?view=1'));assert.ok(!bytes.includes('token=secret'));if(format==='md')assert.ok(bytes.includes('````text\n'+record.note+'\n````'));
 }
 const Backup=require('../native/library-backup-model.cjs');const snapshot={records,index:{schemaVersion:1,tags:[],collections:[],annotations:{},downloads:{}},exists:{journal:true,index:false},origin:'a'.repeat(64)};assert.equal(Backup.decodeBackup(Backup.encodeBackup(snapshot)).snapshot.records[1].note,record.note);assert.throws(()=>Backup.encodeBackup({...snapshot,records:[{...record,note:{invalid:true}}]}));
 console.log('PASS native bookmark roundtrip, idempotent save, legacy fields, bounds, library note search, Markdown/ZIP and backup');
})().catch(e=>{console.error(e);process.exitCode=1});
