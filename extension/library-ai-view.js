(function(root,factory){const api=factory();if(typeof module==='object')module.exports=api;else root.LibraryAiView=api;})(globalThis,()=>{
 const collator=new Intl.Collator('zh-CN',{numeric:true,sensitivity:'base'});
 const modelsOf=p=>p.models?.length?p.models:[{id:p.model,label:p.model,lastTest:p.lastTest}];
 const statusOf=p=>!p.hasKey?'unconfigured':p.lastTest?.revision===p.revision?(p.lastTest.ok?'passed':'failed'):'untested';
 function buildConfigView(profiles,defaultId,view={}){
  const q=(view.query||'').trim().toLocaleLowerCase(),rank={passed:0,untested:1,failed:2,unconfigured:3};
  const rows=Object.values(profiles).filter(p=>(!q||[p.label,...(p.tags||[]),...modelsOf(p).flatMap(m=>[m.id,m.label])].join(' ').toLocaleLowerCase().includes(q))&&(!view.tag||(p.tags||[]).includes(view.tag))&&(!view.status||statusOf(p)===view.status)).map(p=>({...p,matchOtherModel:!!q&&!([p.label,p.model,modelsOf(p).find(m=>m.id===p.model)?.label,...(p.tags||[])].join(' ').toLocaleLowerCase().includes(q))}));
  rows.sort((a,b)=>{if(view.defaultFirst&&(a.profileId===defaultId)!==(b.profileId===defaultId))return a.profileId===defaultId?-1:1;if(view.sort==='status'){const n=rank[statusOf(a)]-rank[statusOf(b)];if(n)return n;}return collator.compare(a.label,b.label)*(view.sort==='name-desc'?-1:1)||a.profileId.localeCompare(b.profileId)});
  const groups=new Map();for(const p of rows)for(const tag of (p.tags?.length?p.tags:[''])){if(view.tag&&view.tag!==tag)continue;if(!groups.has(tag))groups.set(tag,[]);groups.get(tag).push(p)}
  const result=[...groups].map(([tag,rows])=>({tag,rows}));result.sort((a,b)=>{if(view.defaultFirst){const ad=a.rows.some(p=>p.profileId===defaultId),bd=b.rows.some(p=>p.profileId===defaultId);if(ad!==bd)return ad?-1:1;}return a.tag&&b.tag?collator.compare(a.tag,b.tag):a.tag?-1:b.tag?1:0});
  return {groups:result,uniqueCount:rows.length};
 }
 return {buildConfigView,modelsOf,statusOf};
});
