'use strict';
// Library metadata never rewrites the source journal or download jobs.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const ID=/^(clip:[a-f0-9-]{36}|download:[a-f0-9]{32})$/;
const readJson=p=>JSON.parse(fs.readFileSync(p,'utf8').replace(/^\uFEFF/,''));
function atomic(p,value){fs.mkdirSync(path.dirname(p),{recursive:true});const tmp=p+'.'+crypto.randomUUID()+'.tmp';try{fs.writeFileSync(tmp,JSON.stringify(value,null,2),{flag:'wx'});fs.renameSync(tmp,p);}finally{if(fs.existsSync(tmp))fs.unlinkSync(tmp);}}
function sourceUrl(value){try{const u=new URL(String(value||''));if(!['http:','https:'].includes(u.protocol)||u.username||u.password)return '';for(const k of [...u.searchParams.keys()])if(/token|sign|auth|cookie|secret|key|credential|expires|policy/i.test(k))u.searchParams.delete(k);return u.href;}catch{return '';}}
function canonical(value){try{const u=new URL(value);return ['http:','https:'].includes(u.protocol)&&!u.username&&!u.password?u.href:'';}catch{return '';}}
const normalize=s=>String(s||'').replace(/\r\n?/g,'\n').trim();
function fingerprint(content,type){return crypto.createHash('sha256').update(type==='网页地址'?canonical(content)||normalize(content):normalize(content)).digest('hex');}
function noLinks(p){let current=path.resolve(p);while(true){if(fs.existsSync(current)&&fs.lstatSync(current).isSymbolicLink())throw Error('路径包含链接，请使用普通本地目录');const parent=path.dirname(current);if(parent===current)break;current=parent;}return path.resolve(p);}
function fileInfo(filename,directory){const resolved=path.resolve(String(filename||'')),base=path.resolve(directory),relative=path.relative(base,resolved);if(!filename||!path.isAbsolute(filename)||!relative||relative.startsWith('..'+path.sep)||relative==='..'||path.isAbsolute(relative))throw Error('文件不在记录的下载目录内');noLinks(resolved);let stat;try{stat=fs.statSync(resolved);}catch(e){if(e.code!=='ENOENT')throw e;}if(stat&&!stat.isFile())throw Error('记录不是普通文件');return {path:resolved,name:relative.split(path.sep).join('/'),exists:!!stat,size:stat?.size||0,mtimeMs:stat?.mtimeMs||0,ino:stat?.ino||0,dev:stat?.dev||0};}
async function locked(directory,fn){
 noLinks(directory);fs.mkdirSync(directory,{recursive:true});
 // A Windows named pipe provides exclusive ownership and is released by the OS on process exit.
 const key=crypto.createHash('sha256').update(path.resolve(directory).toLowerCase()).digest('hex');
 const pipe='\\\\.\\pipe\\JingcaiLibrary-'+key,net=require('node:net');let server;const start=Date.now();
 while(!server){const candidate=net.createServer(socket=>socket.destroy());try{await new Promise((resolve,reject)=>{candidate.once('error',reject);candidate.listen(pipe,resolve);});server=candidate;}catch(e){if(e.code!=='EADDRINUSE')throw e;if(Date.now()-start>15000)throw Error('资料库正在写入，请稍后重试');await new Promise(r=>setTimeout(r,40));}}
 try{return await fn();}finally{await new Promise(resolve=>server.close(resolve));}
}
function names(values){if(!Array.isArray(values)||values.length>30)throw Error('最多选择 30 个分类');return [...new Set(values.map(name))];}
function name(value){if(typeof value!=='string'||!value.trim()||value.trim().length>60||/[\r\n\x00-\x1f]/.test(value))throw Error('分类名称需要 1–60 字的单行文字');return value.trim();}
function metadata(directory){const p=path.join(directory,'资料库索引.json');if(!fs.existsSync(p))return {schemaVersion:1,tags:[],collections:[],annotations:{},downloads:{}};const s=readJson(p);if(s.schemaVersion!==1||!Array.isArray(s.tags)||!Array.isArray(s.collections)||!s.annotations||!s.downloads||Array.isArray(s.annotations)||Array.isArray(s.downloads))throw Error('资料库索引格式损坏，请从备份恢复，原始资料未改动');return s;}
function load(ctx,s){const warnings=[],journal=path.join(ctx.directory,'摘录数据.json');let records=[];if(fs.existsSync(journal)){records=readJson(journal);if(!Array.isArray(records))throw Error('摘录数据格式损坏');const seen=new Set();for(const r of records){if(!r||!ID.test('clip:'+r.id)||typeof r.content!=='string'||typeof r.type!=='string'||seen.has(r.id))throw Error('摘录数据含无效或重复记录');seen.add(r.id);}}
 const jobs=path.join(ctx.root,'video-jobs');let changed=false;
 if(fs.existsSync(jobs))for(const filename of fs.readdirSync(jobs).filter(n=>/^[a-f0-9]{32}\.json$/.test(n))){try{const j=readJson(path.join(jobs,filename));if(j.state!=='completed')continue;const id='download:'+filename.slice(0,32);if(s.downloads[id])continue;
 const directory=String(j.directory||'');if(!path.isAbsolute(directory))throw Error('无效目录');let paths=j.kind==='files'?j.expectedFiles:j.kind==='gallery'?j.savedFiles:[j.file];if(j.kind==='gallery'&&(!Array.isArray(paths)||!paths.length)){const manifest=path.join(directory,'图集信息.json');noLinks(manifest);if(fs.existsSync(manifest)){const images=readJson(manifest).images;if(Array.isArray(images))paths=images.map(i=>path.join(directory,String(i.file)));}}
 if(!Array.isArray(paths)||!paths.length){if(j.kind==='gallery')throw Error('旧图集缺少完整文件清单，请保留原目录，重新下载后可完整索引');continue;}
 const files=[...new Set(paths)].map(p=>fileInfo(p,directory));const rawSource=j.source||j.arguments?.at(-1)||'';const source=j.kind==='files'&&j.siteName!=='Hugging Face'?(sourceUrl(rawSource)?new URL(sourceUrl(rawSource)).origin:''):sourceUrl(rawSource);
 const item={id,type:j.kind==='gallery'?'图片':j.kind==='files'?(j.siteName==='Hugging Face'?'模型':'文件'):j.mediaMode==='audio'?'音频':'视频',title:String(j.title||path.basename(paths[0])),time:j.createdAt||'',sourceUrl:source,sourceTitle:String(j.title||''),author:String(j.author||''),directory,files,content:''};s.downloads[id]=item;changed=true;
 }catch(e){warnings.push('部分下载记录未能索引：'+e.message);}}
 const items=records.map(r=>({id:'clip:'+r.id,type:r.type,title:r.title||(r.type==='网页地址'?sourceUrl(r.content):r.content).slice(0,65),content:r.content,time:r.time,sourceUrl:sourceUrl(r.sourceUrl||(r.type==='网页地址'?r.content:'')),sourceTitle:r.sourceTitle||'',author:r.author||'',files:[]}));
 for(const item of Object.values(s.downloads)){if(!ID.test(item.id)||!Array.isArray(item.files))throw Error('下载索引损坏');const files=item.files.map(f=>{try{return fileInfo(f.path,item.directory);}catch{return {...f,exists:false,unsafe:true};}});items.push({...item,files});}
 for(const item of items){const a=s.annotations[item.id]||{};item.tags=Array.isArray(a.tags)?a.tags:[];item.collections=Array.isArray(a.collections)?a.collections:[];if(typeof a.author==='string')item.author=a.author;try{item.source=new URL(item.sourceUrl).hostname;}catch{item.source='未知来源';}}
 return {items,warnings,changed};
}
function summary(item){const {content,files,...rest}=item;return {...rest,preview:content.slice(0,240),fileCount:files.length,missingCount:files.filter(f=>!f.exists).length};}
function select(items,ids){if(!Array.isArray(ids)||!ids.length||ids.length>100||ids.some(id=>typeof id!=='string'||!ID.test(id)))throw Error('请选择 1–100 份有效资料');return [...new Set(ids)].map(id=>{const item=items.find(i=>i.id===id);if(!item)throw Error('资料已变化，请刷新后重试');return item;});}
async function dispatch(message,ctx){if(!ctx?.directory||!ctx.root)throw Error('资料目录未配置');return locked(ctx.directory,async()=>{
 const backup=require('./library-backup.cjs');const recovery=backup.recover(ctx);if(message.action==='library-recover')return {ok:true,...recovery};
 if(/^library-(backup|restore)-/.test(message.action))return backup.dispatch(message,ctx);
 const s=metadata(ctx.directory),{items,warnings,changed}=load(ctx,s),index=path.join(ctx.directory,'资料库索引.json');if(changed)atomic(index,s);
 const revision=crypto.createHash('sha256').update(JSON.stringify([items,s.tags,s.collections])).digest('hex').slice(0,24);
 if(message.action==='library-snapshot')return {ok:true,warnings:warnings.slice(0,50),snapshotted:message.id?!!s.downloads['download:'+message.id]:true};
 if(message.action==='library-query'){
  if(message.revision&&message.revision!==revision)throw Error('资料已变化，请刷新列表后翻页');
  const query=String(message.query||'').toLocaleLowerCase();let filtered=items.filter(i=>(!message.type||i.type===message.type)&&(!message.source||i.source===message.source)&&(!message.tag||i.tags.includes(message.tag))&&(!message.collection||i.collections.includes(message.collection))&&[i.title,i.content,i.author,i.sourceUrl,i.sourceTitle,...i.tags,...i.collections,...i.files.map(f=>f.name)].join('\n').toLocaleLowerCase().includes(query));
  filtered.sort((a,b)=>(Date.parse(b.time)||0)-(Date.parse(a.time)||0)||a.id.localeCompare(b.id));const offset=Math.max(0,Math.trunc(Number(message.offset)||0));
  return {ok:true,items:filtered.slice(offset,offset+40).map(summary),total:filtered.length,offset,revision,warnings:warnings.slice(0,50),warningCount:warnings.length,facets:{types:[...new Set(items.map(i=>i.type))].sort(),sources:[...new Set(items.map(i=>i.source))].sort(),tags:s.tags,collections:s.collections}};
 }
 if(message.action==='library-read'){const item=select(items,[message.id])[0],offset=Math.max(0,Math.trunc(Number(message.offset)||0));if(offset>item.content.length)throw Error('正文位置无效');const content=item.content.slice(offset,offset+12000);const fileOffset=Math.max(0,Math.trunc(Number(message.fileOffset)||0));return {ok:true,item:{...summary(item),files:item.files.slice(fileOffset,fileOffset+200)},fileTotal:item.files.length,nextFileOffset:Math.min(fileOffset+200,item.files.length),content,total:item.content.length,nextOffset:offset+content.length};}
 if(message.action==='library-duplicates'){const fp=fingerprint(message.content,message.type);return {ok:true,matches:items.filter(i=>i.id.startsWith('clip:')&&fingerprint(i.content,i.type)===fp).slice(0,10).map(summary)};}
 if(message.action==='library-update'){const selected=select(items,message.ids);for(const key of ['tags','collections'])if(message[key]!==undefined){const chosen=names(message[key]);if(chosen.some(n=>!s[key].includes(n)))throw Error('分类已变化，请刷新后重试');}
  if(message.author!==undefined&&(typeof message.author!=='string'||message.author.length>120))throw Error('作者最多 120 字');
  for(const item of selected){const a=s.annotations[item.id]||{};for(const k of ['tags','collections','author'])if(message[k]!==undefined)a[k]=message[k];s.annotations[item.id]=a;}atomic(index,s);return {ok:true};
 }
 if(message.action==='library-taxonomy'){const key=message.kind;if(!['tags','collections'].includes(key))throw Error('分类类型无效');const old=name(message.name);if(message.operation==='create'){if(!s[key].includes(old))s[key].push(old);}else{if(!s[key].includes(old))throw Error('分类不存在');if(message.operation==='rename'){const next=name(message.newName);if(s[key].includes(next)&&next!==old)throw Error('分类名称已存在');s[key]=s[key].map(v=>v===old?next:v);for(const a of Object.values(s.annotations))a[key]=(a[key]||[]).map(v=>v===old?next:v);}else if(message.operation==='delete'){s[key]=s[key].filter(v=>v!==old);for(const a of Object.values(s.annotations))a[key]=(a[key]||[]).filter(v=>v!==old);}else throw Error('分类操作无效');}atomic(index,s);return {ok:true};}
 if(message.action==='library-open'){const item=select(items,[message.id])[0];if(!item.directory)throw Error('文字资料没有下载目录');noLinks(item.directory);if(!fs.statSync(item.directory).isDirectory())throw Error('目录已移动');require('node:child_process').spawn(path.join(process.env.SystemRoot,'explorer.exe'),[item.directory],{windowsHide:false,detached:true,stdio:'ignore'}).unref();return {ok:true};}
 if(message.action.startsWith('library-export-'))return require('./library-export.cjs').dispatch(message,ctx,items);
 throw Error('不支持的资料库操作');
 });}
module.exports={locked,dispatch,atomic,readJson,fileInfo,noLinks,sourceUrl,select};
if(require.main===module){let input='';process.stdin.setEncoding('utf8');process.stdin.on('data',b=>input+=b);process.stdin.on('end',async()=>{try{const {message,root,directory}=JSON.parse(input.replace(/^\uFEFF/,''));console.log(JSON.stringify(await dispatch(message,{root,directory})));}catch(e){console.log(JSON.stringify({ok:false,error:e.message,code:'LIBRARY_ERROR'}));}});}
