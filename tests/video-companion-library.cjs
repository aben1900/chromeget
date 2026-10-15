const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),Library=require('../native/library.cjs');
(async()=>{
 const root=path.resolve('work/companion-library-'+Date.now()),directory=path.join(root,'files'),jobs=path.join(root,'video-jobs');fs.mkdirSync(directory,{recursive:true});fs.mkdirSync(jobs,{recursive:true});
 const id='c'.repeat(32),video=path.join(directory,'movie.mp4'),folder=path.join(directory,'movie-'+id.slice(0,8)),note=path.join(folder,'说明.txt'),cover=path.join(folder,'封面.png');fs.mkdirSync(folder);fs.writeFileSync(video,'video');fs.writeFileSync(note,'description');fs.writeFileSync(cover,'image');
 const job={state:'completed',directory,file:video,title:'果冻码头',source:'https://www.xiaohongshu.com/explore/abc?xsec_token=SECRET',createdAt:'2026-10-15T00:00:00.000Z',companion:{title:'果冻码头',author:'你的提示音',text:'Day 2\n从想要一座海边小镇开始',files:[note],status:'partial'}};
 const jobPath=path.join(jobs,id+'.json');fs.writeFileSync(jobPath,JSON.stringify(job));const request=m=>Library.dispatch(m,{root,directory});
 let result=await request({action:'library-query',query:'海边小镇'});assert.equal(result.total,1);assert.equal(result.items[0].fileCount,2);assert.ok(!result.items[0].sourceUrl.includes('SECRET'));
 job.companion.files.push(cover);job.companion.status='complete';fs.writeFileSync(jobPath,JSON.stringify(job));await request({action:'library-refresh-download',id});
 result=await request({action:'library-read',id:'download:'+id});assert.equal(result.item.fileCount,3);assert.equal(result.item.author,'你的提示音');assert.equal(result.content,job.companion.text);
 const exportPlan=await request({action:'library-export-prepare',ids:['download:'+id],format:'zip',includeFiles:true});assert.equal(exportPlan.files,3);
 fs.unlinkSync(cover);result=await request({action:'library-read',id:'download:'+id});assert.equal(result.item.missingCount,1);
 console.log('PASS one searchable video companion record, refresh and missing file state');
})().catch(e=>{console.error(e);process.exitCode=1});
