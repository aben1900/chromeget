(() => {
 const $=id=>document.getElementById(id),{send,selected,explain}=window.LibraryAi;let recordId=null,epoch=0,request=null,busy=false;
 function invalidate(){epoch++;}
 function result(r){if(r.recordId!==recordId)return;request=r;$('aiCheck').hidden=!['running','unknown'].includes(r.state);$('aiGenerate').disabled=busy||['running','unknown'].includes(r.state);
  if(r.state==='completed'){$('aiResult').hidden=false;$('aiText').value=r.text;$('aiCopy').disabled=!r.text;$('aiSave').disabled=!!r.savedRevision;$('aiStatus').textContent=r.savedRevision?'已保存摘要':'';}
  else $('aiStatus').textContent=r.state==='running'?'正在生成，可继续浏览其他资料。':explain(Error(r.errorCode||'RESULT_UNKNOWN'));
 }
 async function open(detail){invalidate();const e=epoch;recordId=detail.id;request=null;$('aiCopy').disabled=$('aiSave').disabled=true;$('aiGenerate').disabled=busy;$('aiResult').hidden=true;$('aiCheck').hidden=true;$('aiStatus').textContent='';$('aiSummary').hidden=!recordId||!['内容','评论','评阅','提示词'].includes(detail.type);document.querySelector('.detail-model-picker').hidden=$('aiSummary').hidden;if($('aiSummary').hidden)return;
  try{const r=await send('ai-read',{id:recordId});if(e!==epoch)return;if(r.summary){$('aiResult').hidden=false;$('aiText').value=r.summary.text;$('aiCopy').disabled=!r.summary.text;$('aiSave').disabled=true;$('aiStatus').textContent=(r.stale?'原文已变化，摘要可能过期。':'已保存摘要。')+' '+r.summary.provider+' · '+r.summary.model;}
   const recent=await send('ai-recent',{id:recordId});if(e!==epoch)return;const latest=recent.requests.find(v=>v.recordId===recordId&&v.state!=='prepared');
   if(latest){if(!latest.savedRevision){const r=await send('ai-status',{requestId:latest.requestId});if(e===epoch)result(r);}}
   else{const local=await chrome.storage.local.get('aiPending');if(e!==epoch)return;if(typeof local.aiPending==='string'){try{const r=await send('ai-status',{requestId:local.aiPending});if(e===epoch&&r.recordId===recordId&&!r.savedRevision)result(r);}catch{/* A removed or different-directory request must not hide the saved summary. */}}}
  }catch(err){if(e===epoch)$('aiStatus').textContent=explain(err);}
 }
 window.addEventListener('library-detail',e=>open(e.detail));window.addEventListener('library-restored',()=>open({id:null}));window.addEventListener('ai-profile-changed',invalidate);$('aiLength').addEventListener('change',invalidate);
 $('aiGenerate').addEventListener('click',async(event)=>{
  if(event.detail>1||busy||!recordId||request&&['running','unknown'].includes(request.state))return;
  const e=++epoch,id=recordId;busy=true;$('aiGenerate').disabled=true;$('aiGenerate').setAttribute('aria-busy','true');$('aiGenerate').title='正在生成…';$('aiStatus').textContent='';
  try{
   const model=selected();const p=await send('ai-prepare',{id,profileId:model.profileId,model:model.model,temporary:model.temporary===true,length:$('aiLength').value});
   if(e!==epoch)return;
   request={requestId:p.requestId,recordId:p.recordId,state:'running',expectedSummaryRevision:p.expectedSummaryRevision};
   await chrome.storage.local.set({aiPending:p.requestId});
   if(e!==epoch)return;
   const r=await send('ai-generate',{requestId:p.requestId,confirmed:true});if(e===epoch)result(r);
  }catch(err){if(e===epoch){$('aiStatus').textContent=explain(err);if(request?.state==='running'){request.state='unknown';$('aiCheck').hidden=false;}}}
  finally{busy=false;$('aiGenerate').setAttribute('aria-busy','false');$('aiGenerate').title='生成摘要';$('aiGenerate').disabled=!!request&&['running','unknown'].includes(request.state);}
 });
 $('aiCheck').addEventListener('click',async()=>{if(!request)return;const e=epoch;try{const r=await send('ai-status',{requestId:request.requestId});if(e===epoch)result(r);}catch(err){if(e===epoch)$('aiStatus').textContent=explain(err);}});
 $('aiText').addEventListener('input',()=>{$('aiCopy').disabled=!$('aiText').value;});
 $('aiCopy').addEventListener('click',async()=>{try{await navigator.clipboard.writeText($('aiText').value);$('aiStatus').textContent='摘要已复制';}catch{$('aiStatus').textContent='复制失败，请选择文本后复制。';}});
 $('aiSave').addEventListener('click',async()=>{if(!request||request.state!=='completed')return;const e=epoch;$('aiSave').disabled=true;try{await send('ai-save',{requestId:request.requestId,text:$('aiText').value,expectedSummaryRevision:request.expectedSummaryRevision});if(e===epoch){$('aiStatus').textContent='摘要已保存，原文保留。';request.savedRevision='saved';window.dispatchEvent(new CustomEvent('library-summary-saved',{detail:{id:recordId}}));}}catch(err){if(e===epoch){$('aiStatus').textContent=explain(err);$('aiSave').disabled=false;}}});
})();
