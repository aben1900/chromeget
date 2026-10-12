let tasksLoading=false,taskOffset=0,taskRevision=0,taskRefreshPending=false;
function requestTaskRefresh(){
  taskRevision++;setTaskListLoading(true);$('tasksError').textContent='';
  return poll();
}
setTaskListLoading(true);
$('taskFilter').value='unfinished';
async function poll() {
  if(tasksLoading){taskRefreshPending=true;return;}
  clearTimeout(timer);tasksLoading=true;
  const requestedRevision=taskRevision;
  try {
    const requestedFilter=$('taskFilter').value,requestedOffset=taskOffset;
    const data=await send('video-jobs',{statusFilter:requestedFilter,offset:requestedOffset});
    if(requestedRevision!==taskRevision || requestedFilter!==$('taskFilter').value || requestedOffset!==taskOffset)return;
    const items=data.items || [];
    $('tasksError').textContent='';
    const total=data.total ?? items.length;
    if(!items.length && taskOffset>0){taskOffset=Math.max(0,taskOffset-50);taskRefreshPending=true;return;}
    $('tasksSummary').textContent=total?'共 '+total+' 个任务'+(total>50?' · 第 '+(Math.floor(taskOffset/50)+1)+' 页':''):'暂无任务';
    $('tasksPrevious').disabled=taskOffset===0;$('tasksNext').disabled=taskOffset+items.length>=total;
    const pagination=$('tasksPrevious').closest('.task-pagination');if(pagination)pagination.hidden=total<=50;

    if(typeof setupTaskBatch==='function')setupTaskBatch(items,send,poll);
    const batch=$('taskBatch');if(batch)batch.hidden=!items.length;
    $('tasksList').replaceChildren(...items.map(task=>{
      if(typeof renderTaskCard==='function')return renderTaskCard(task,send,poll);
      const card=document.createElement('article'),title=document.createElement('p'),state=document.createElement('p'),progress=document.createElement('pre');
      card.className='download-task';title.textContent=task.title || task.source || task.siteName || '下载任务';
      state.textContent=({starting:'准备下载',running:'后台下载 / 合并中',completed:'已完成',failed:'已中断 / 失败'})[task.state] || task.state;
      progress.textContent=task.progress || '';const time=document.createElement('p');time.className='hint';time.textContent=task.createdAt?'创建于 '+new Date(task.createdAt).toLocaleString('zh-CN',{hour12:false}):'';card.append(title,time,state,progress);
      if(task.error){const error=document.createElement('p');error.className='task-error';error.textContent=task.error;card.append(error);}
      const actions=document.createElement('div');actions.className='task-actions';
      if(task.canResume){const resume=document.createElement('button');resume.textContent='续传';resume.title='继续下载（断点续传）';resume.addEventListener('click',async()=>{
        resume.disabled=true;
        try{await send('video-resume',{id:task.id});await poll();}catch(error){$('tasksError').textContent=error.message;resume.disabled=false;}
      });actions.append(resume);}
      const open=document.createElement('button');open.textContent='打开目录';open.title=task.directory || '打开此任务的保存目录';
      open.addEventListener('click',async()=>{
        open.disabled=true;
        try{await send('video-open-task',{id:task.id});$('tasksError').textContent='';}catch(error){$('tasksError').textContent=error.message;}
        finally{open.disabled=false;}
      });actions.append(open);
      const remove=document.createElement('button');remove.textContent=['running','starting'].includes(task.state)?'停止并删除':'删除';
      remove.addEventListener('click',async()=>{
        remove.disabled=true;clearTimeout(timer);
        try{await send('video-delete',{id:task.id});await poll();}catch(error){$('tasksError').textContent=error.message;remove.disabled=false;timer=setTimeout(poll,3000);}
      });actions.append(remove);card.append(actions);
      return card;
    }));
   }catch(error){if(requestedRevision===taskRevision)$('tasksError').textContent='任务读取失败：'+error.message+'，可点击刷新重试。';}
  finally{
    tasksLoading=false;
    if(taskRefreshPending){taskRefreshPending=false;void poll();}
    else{setTaskListLoading(false);timer=setTimeout(poll,3000);}
  }
}
$('refreshTasks').addEventListener('click',requestTaskRefresh);
$('taskFilter').addEventListener('change',()=>{taskOffset=0;requestTaskRefresh();});
$('tasksPrevious').addEventListener('click',()=>{taskOffset=Math.max(0,taskOffset-50);requestTaskRefresh();});
$('tasksNext').addEventListener('click',()=>{taskOffset+=50;requestTaskRefresh();});


poll();
