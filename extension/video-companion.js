window.VideoCompanion=(()=>{
  const byId=id=>document.getElementById(id);
  function create({send,capture,onChange=()=>{}}){
    const card=byId('companionCard'),title=byId('companionTitle'),body=byId('companionText'),author=byId('companionAuthor'),imagesBox=byId('companionImages'),status=byId('companionStatus');
    let draft=null,images=[],revision=0,busy=false,externalBusy=false,unsupported=false,initial='',submitted='',sourceUrl='';
    function signature(){return JSON.stringify([title.value,body.value,images.filter(i=>i.selected).map(i=>i.id)]);}
    function summary(){byId('companionSummary').textContent=`${body.value.trim()?'正文已带入':'正文待补充'} · ${images.some(i=>i.role==='cover'&&i.selected)?'封面已带入':'封面待补充'} · ${images.filter(i=>i.selected).length} 张图片`;onChange();}
    function updateButtons(){byId('companionChoose').disabled=busy||externalBusy||!draft||images.length>=10;byId('companionCapture').disabled=busy||externalBusy||!draft||images.length>=10;}
    function render(){imagesBox.replaceChildren();for(const item of images){
      const row=document.createElement('div');row.className='companion-image';
      if(item.previewData){const image=document.createElement('img');image.alt=item.role==='cover'?'视频封面':'配套图片';image.src=item.previewData;row.append(image);}else{const placeholder=document.createElement('span');placeholder.className='companion-preview-fallback';placeholder.textContent=item.pending?'封面准备中':'图片预览';row.append(placeholder);}
      const details=document.createElement('div');details.className='companion-image-details';const label=document.createElement('strong');label.textContent=item.role==='cover'?'封面':'配图';const source=document.createElement('small');source.textContent=item.pending?'正在准备封面…':item.source||'已添加';details.append(label,source);row.append(details);
      const toggle=document.createElement('input');toggle.type='checkbox';toggle.checked=item.selected;toggle.disabled=item.pending||busy||externalBusy;toggle.setAttribute('aria-label','选择'+(item.role==='cover'?'封面':'配图'));toggle.addEventListener('change',()=>{item.selected=toggle.checked;summary();});row.append(toggle);
      const remove=document.createElement('button');remove.type='button';remove.className='companion-remove';remove.title='移除图片';remove.setAttribute('aria-label','移除图片');remove.innerHTML='<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>';
      remove.disabled=busy||externalBusy;remove.addEventListener('click',async()=>{if(!draft||busy)return;const token=revision;busy=true;render();try{await send('video-companion-remove',{draftId:draft.draftId,imageId:item.id});if(token!==revision)return;images=images.filter(i=>i!==item);status.textContent='图片已移除，可继续补图。';}catch(error){if(token===revision)status.textContent='移除图片失败：'+error.message;}finally{busy=false;if(token===revision)render();}});row.append(remove);imagesBox.append(row);
    }summary();updateButtons();}
    function reset(){revision++;draft=null;images=[];unsupported=false;initial='';submitted='';sourceUrl='';card.hidden=true;title.value='';body.value='';author.textContent='';status.textContent='';render();}
    function showUnsupported(url){reset();unsupported=true;sourceUrl=url;card.hidden=false;byId('companionDetails').open=true;status.textContent='本地程序版本较旧，视频仍可下载；请在管理中心更新 / 修复后使用配套图文。';title.disabled=true;body.disabled=true;updateButtons();}
    function show(data,url){reset();if(!data?.draftId)return;draft=data;sourceUrl=url;title.value=data.title||'';body.value=data.text||'';author.textContent=data.author?'作者：'+data.author:'来源未提供作者';card.hidden=false;byId('companionDetails').open=true;
      images=(data.images||[]).slice(0,10).map(i=>({...i,selected:true,pending:!i.staged}));status.textContent=data.truncated?'帖文过长，已截取可保存部分；请核对。':(!body.value.trim()?'当前视频未提供帖子正文，可手动补充。':'');render();initial=signature();
      const token=revision;for(const item of images.filter(i=>i.pending&&i.role==='cover')){send('video-companion-stage-cover',{draftId:data.draftId,imageId:item.id}).then(result=>{if(token!==revision||!images.includes(item))return;Object.assign(item,result.images?.[0]||{}, {pending:false});render();}).catch(error=>{if(token!==revision||!images.includes(item))return;images=images.filter(i=>i!==item);status.textContent='封面准备失败：'+error.message+'。可选本地图片或继续下载视频。';render();});}
    }
    function selection(){if(!draft)return{};if(busy)throw Error('配套图片正在修改，请稍候。');if(images.some(i=>i.selected&&i.pending))throw Error('封面尚在准备，请稍候或移除。');return{companionDraftId:draft.draftId,companionTitle:title.value,companionText:body.value,companionImageIds:images.filter(i=>i.selected).map(i=>i.id)};}
    function hasChanges(){return !!draft&&signature()!==initial;}
    function hasUnsubmittedChanges(){return !!draft&&signature()!==submitted;}
    function markSubmitted(){submitted=signature();initial=submitted;}
    function setDisabled(value){if(externalBusy===!!value)return;externalBusy=!!value;title.disabled=externalBusy||unsupported;body.disabled=externalBusy||unsupported;render();}
    async function add(action,extra){if(!draft||busy)return;const token=revision;busy=true;updateButtons();status.textContent=action==='video-companion-choose'?'正在打开图片选择框…':'请在当前视频帖页框选图片；Esc 取消。';
      try{const result=await send(action,{draftId:draft.draftId,...extra});if(token!==revision)return;if(result.cancelled){status.textContent='已取消';return;}for(const image of result.images||[])images.push({...image,selected:true,pending:false});status.textContent='图片已加入配套资料，下载前仍可移除。';render();}
      catch(error){if(token===revision)status.textContent='添加图片失败：'+error.message;}
      finally{busy=false;updateButtons();}
    }
    byId('companionChoose').addEventListener('click',()=>add('video-companion-choose'));
    byId('companionCapture').addEventListener('click',async()=>{if(!draft||busy)return;const token=revision;busy=true;updateButtons();status.textContent='请在当前视频帖页框选图片；Esc 取消。';
      try{const result=await capture({confirmLabel:'加入配套图片'});if(token!==revision)return;if(result.cancelled){status.textContent='已取消截图';return;}busy=false;await add('video-companion-capture',{png:result.png,sourceUrl:result.sourceUrl});}
      catch(error){if(token===revision)status.textContent='截图失败：'+error.message;}
      finally{busy=false;updateButtons();}
    });
    for(const field of [title,body])field.addEventListener('input',summary);
    return{show,showUnsupported,reset,selection,hasChanges,hasUnsubmittedChanges,markSubmitted,setDisabled,hasContent:()=>!!draft&&(!!body.value.trim()||images.some(i=>i.selected)),isActive:()=>!!draft||unsupported,sourceUrl:()=>sourceUrl};
  }
  return{create};
})();
