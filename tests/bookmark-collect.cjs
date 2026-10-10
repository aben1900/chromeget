const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),{randomUUID}=require('node:crypto');
const Collect=require('../extension/collect-model.js');
let local={},session={},offline=false,capabilities=['library-v1','bookmark-metadata-v1'],duplicate=false,saves=[];
const context=vm.createContext({Collect,crypto:{randomUUID},Recovery:{redact:s=>s},chrome:{storage:{local:{get:async()=>structuredClone(local),set:async v=>Object.assign(local,structuredClone(v))},session:{get:async k=>({[k]:structuredClone(session[k])}),set:async v=>Object.assign(session,structuredClone(v))}}},
 native:async m=>{if(offline)throw Object.assign(Error('offline'),{code:'HOST_UNAVAILABLE'});if(m.action==='status')return {ok:true,capabilities};if(m.action==='library-duplicates')return {ok:true,matches:duplicate?[{id:'clip:existing'}]:[]};throw Error('unexpected action');},
 flush:async()=>{if(offline)return;for(const record of local.pending||[]){saves.push(structuredClone(record));(local.savedCollect||={})[record.id]=Date.now();}local.pending=[];}});
vm.runInContext(fs.readFileSync('extension/collect-service.js','utf8'),context);
const request=(action,extra={})=>context.collectionRequest({action,windowId:1,...extra});
async function edit(extra={}){return (await request('collect-edit',{text:'https://example.com/article',type:'内容',title:'',bookmarkTitle:'资料名称',note:'第一行\n第二行',author:'张三',...extra})).draft;}
const submit=d=>({id:d.id,revision:d.revision});
(async()=>{
 // Dropping any field while building the durable record or reconstructing it on retry must fail.
 let d=await edit();offline=true;let r=await request('collect-save',submit(d));assert.equal(r.state,'pending');
 assert.deepEqual(JSON.parse(JSON.stringify(local.pending[0])),{id:d.id,time:d.time,type:'网页地址',content:'https://example.com/article',sourceUrl:'',sourceTitle:'',title:'资料名称',note:'第一行\n第二行',author:'张三'});
 offline=false;r=await request('collect-retry',submit(d));assert.equal(r.state,'saved');assert.equal(saves.length,1);assert.equal(saves[0].id,d.id);assert.equal(saves[0].note,'第一行\n第二行');
 await request('collect-retry',submit(d));assert.equal(saves.length,1);
 d=await edit({bookmarkTitle:'中断重试'});session['collect-draft:1'].submissionState='submitting';await request('collect-retry',submit(d));assert.equal(saves.at(-1).title,'中断重试');assert.equal(saves.at(-1).author,'张三');assert.equal(saves.at(-1).id,d.id);
 // Unsupported hosts must not receive metadata they would silently discard, including explicit duplicate saves.
 d=await edit();capabilities=['library-v1'];await assert.rejects(request('collect-save',{...submit(d),allowDuplicate:true}),/更新/);assert.equal(session['collect-draft:1'].submissionState,'editing');assert.equal(local.pending.length,0);
 session['collect-draft:1'].submissionState='submitting';await assert.rejects(request('collect-retry',submit(d)),/更新/);assert.equal(local.pending.length,0);capabilities.push('bookmark-metadata-v1');
 // Required title and bounded optional fields reject before enqueue and never invent a new ID.
 session['collect-draft:1'].submissionState='editing';
 for(const fields of [{bookmarkTitle:''},{bookmarkTitle:'x'.repeat(121)},{bookmarkTitle:'two\nlines'},{note:'x'.repeat(2001)},{author:'x'.repeat(121)}]){d=await edit(fields);await assert.rejects(request('collect-save',submit(d)));assert.equal(local.pending.length,0);}
 d=await edit();duplicate=true;r=await request('collect-save',submit(d));assert.equal(r.state,'duplicate');assert.equal(session['collect-draft:1'].id,d.id);const before=saves.length;await request('collect-save',{...submit(d),allowDuplicate:true});assert.equal(saves.length,before+1);assert.equal(saves.at(-1).id,d.id);assert.equal(saves.at(-1).title,'资料名称');
 // A submitted pre-upgrade URL draft without metadata can still retry the original record.
 const oldId=randomUUID();session['collect-draft:1']={id:oldId,revision:1,time:new Date().toISOString(),text:'https://legacy.example/',type:'内容',title:'',submissionState:'submitting'};await request('collect-retry',{id:oldId});assert.equal(saves.at(-1).id,oldId);assert.equal(saves.at(-1).content,'https://legacy.example/');
 console.log('PASS bookmark durable metadata, offline/unknown retry ID, duplicate consent, limits, legacy retry and old-host guard');
})().catch(e=>{console.error(e);process.exitCode=1;});
