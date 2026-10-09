'use strict';
// Called only inside the journal mutex / library pipe. No network operations here.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {validateInput,normalizeProfile}=require('./ai-provider.cjs');
const UUID=/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/;
const hash=s=>crypto.createHash('sha256').update(s).digest('hex');
function dispatch(m,ctx,items,index){
 const {atomic,noLinks,readJson,select}=require('./library.cjs');
 const directoryHash=hash(path.resolve(ctx.directory).toLowerCase());const folder=noLinks(path.join(ctx.root,'ai-jobs',directoryHash));
 const filename=id=>{if(typeof id!=='string'||!UUID.test(id))throw Error('REQUEST_INVALID');return noLinks(path.join(folder,id+'.json'));};
 function read(id){const f=filename(id);if(!fs.existsSync(f)||fs.statSync(f).size>262144)throw Error('REQUEST_INVALID');const s=readJson(f);if(s.id!==id||s.directoryHash!==directoryHash)throw Error('REQUEST_INVALID');if(s.state==='running'&&Date.now()-s.startedAt>90000){s.state='unknown';s.errorCode='RESULT_UNKNOWN';atomic(f,s);}return s;}
 const persist=s=>atomic(filename(s.id),s);
 const publicState=s=>({ok:true,requestId:s.id,recordId:s.recordId,state:s.state,profileId:s.profileId,model:s.model,createdAt:s.createdAt,text:s.text,errorCode:s.errorCode,expectedSummaryRevision:s.expectedSummaryRevision,savedRevision:s.savedRevision});
 const states=()=>fs.existsSync(folder)?fs.readdirSync(folder).filter(n=>UUID.test(n.slice(0,-5))&&n.endsWith('.json')).map(n=>read(n.slice(0,-5))):[];
 const itemFor=id=>{const item=select(items,[id])[0];if(!['内容','评论','评阅','提示词'].includes(item.type)||!item.id.startsWith('clip:'))throw Error('INPUT_UNSUPPORTED');return item;};
 const sourceHash=item=>hash(JSON.stringify([item.type,item.content]));
 if(m.action==='library-ai-read'){const item=itemFor(m.id),summary=index.annotations[item.id]?.summary||null;return {ok:true,summary,stale:!!summary&&summary.sourceHash!==sourceHash(item)};}
 if(m.action==='library-ai-recent')return {ok:true,requests:states().sort((a,b)=>b.createdAt-a.createdAt).slice(0,10).map(s=>{const {text,...rest}=publicState(s);return rest;})};
 if(m.action==='library-ai-prepare'){
  const item=itemFor(m.id);validateInput(item.content);const p=normalizeProfile(m.profile);if(!p.hasKey)throw Error('KEY_NOT_CONFIGURED');if(!['short','standard','detailed'].includes(m.length))throw Error('CONFIG_INVALID');
  const s={id:crypto.randomUUID(),recordId:item.id,profileId:p.profileId,profileRevision:p.revision,providerLabel:p.label,model:p.model,length:m.length,sourceHash:sourceHash(item),expectedSummaryRevision:index.annotations[item.id]?.summary?.revision||null,directoryHash,state:'prepared',createdAt:Date.now()};persist(s);
  return {...publicState(s),characters:Array.from(item.content).length,bytes:Buffer.byteLength(item.content),profile:p,expiresAt:s.createdAt+900000};
 }
 const s=read(m.requestId);
 if(m.action==='library-ai-inspect')return {...publicState(s),profileRevision:s.profileRevision};
 if(m.action==='library-ai-status')return publicState(s);
 if(m.action==='library-ai-claim'){
  if(s.state!=='prepared')return publicState(s);if(Date.now()-s.createdAt>900000)throw Error('PREVIEW_EXPIRED');if(s.profileRevision!==m.profileRevision)throw Error('CONFIG_CHANGED');
  const item=itemFor(s.recordId);if(sourceHash(item)!==s.sourceHash)throw Error('SOURCE_CHANGED');if(states().some(v=>v.recordId===s.recordId&&v.state==='running'))throw Error('ALREADY_RUNNING');
  s.state='running';s.startedAt=Date.now();s.executionToken=crypto.randomUUID();persist(s);return {ok:true,shouldSend:true,executionToken:s.executionToken,text:item.content,length:s.length};
 }
 if(m.action==='library-ai-finish'||m.action==='library-ai-fail'){
  if(s.state!=='running'||s.executionToken!==m.executionToken)throw Error('REQUEST_INVALID');
  if(m.action==='library-ai-finish'){if(typeof m.text!=='string'||!m.text.trim()||Array.from(m.text).length>16000)throw Error('RESPONSE_INVALID');s.text=m.text;s.state='completed';s.generatedAt=new Date().toISOString();}
  else{s.state=['NETWORK_TIMEOUT','NETWORK_ERROR','RESULT_UNKNOWN'].includes(m.errorCode)?'unknown':'failed';s.errorCode=/^[A-Z_]{1,60}$/.test(m.errorCode)?m.errorCode:'NETWORK_ERROR';}
  delete s.executionToken;persist(s);return publicState(s);
 }
 if(m.action==='library-ai-save'){
  if(s.state!=='completed'||typeof m.text!=='string'||!m.text.trim()||Array.from(m.text).length>16000)throw Error('REQUEST_INVALID');
  const item=itemFor(s.recordId);if(sourceHash(item)!==s.sourceHash)throw Error('SOURCE_CHANGED');
  const current=index.annotations[item.id]?.summary;const textHash=hash(m.text);
  if(s.savedRevision||current?.generationId===s.id){if(current?.generationId!==s.id||hash(current.text)!==textHash)throw Error('SUMMARY_CONFLICT');s.savedRevision=current.revision;s.savedTextHash=textHash;persist(s);return {ok:true,summaryRevision:current.revision};}
  if((m.expectedSummaryRevision??null)!==s.expectedSummaryRevision||(current?.revision||null)!==s.expectedSummaryRevision)throw Error('SUMMARY_CONFLICT');
  const summary={text:m.text,provider:s.providerLabel,model:s.model,generatedAt:s.generatedAt,sourceHash:s.sourceHash,revision:crypto.randomUUID(),generationId:s.id,edited:m.text!==s.text};
  index.annotations[item.id]={...index.annotations[item.id],summary};atomic(path.join(ctx.directory,'资料库索引.json'),index);
  s.savedRevision=summary.revision;s.savedTextHash=textHash;persist(s);return {ok:true,summaryRevision:summary.revision};
 }
 throw Error('REQUEST_INVALID');
}
module.exports={dispatch};
