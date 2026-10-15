const selectedTasks=new Set(), expandedTasks=new Set(), expandedLogs=new Set();
let visibleTasks=[], batchBusy=false;
const pendingTaskActions=new Set();
function taskCanPause(task){return ['queued','starting','running'].includes(task.state);}
function taskCanResume(task){return task.state==='paused'||(task.state==='failed'&&task.canResume===true);}
function formatBytes(value){if(!Number.isFinite(value)||value<0)return '—';if(value===0)return '0 B';const i=Math.min(4,Math.floor(Math.log(value)/Math.log(1024)));return (value/1024**i).toFixed(i?1:0)+' '+['B','KiB','MiB','GiB','TiB'][i];}
function formatEta(seconds){if(!Number.isFinite(seconds)||seconds<0)return '—';const n=Math.ceil(seconds);return n>=3600?`${Math.floor(n/3600)}时${Math.floor(n%3600/60)}分`:n>=60?`${Math.floor(n/60)}分${n%60}秒`:`${n}秒`;}
function logBytes(value){const m=String(value).match(/^([\d.]+)([KMGT]?)(?:i?B)$/i);return m?Number(m[1])*1024**(m[2]?'KMGT'.indexOf(m[2].toUpperCase())+1:0):0;}
function taskMetrics(task){
  let m=task.metrics;
  const stale=m?.updatedAt && Date.now()-Date.parse(m.updatedAt)>15000;
  if(!m || (stale && task.state==='running')){
    const matches=[...(task.progress||'').matchAll(/\[#[\w]+\s+([\d.]+[KMGT]?i?B)\/([\d.]+[KMGT]?i?B)(?:\((\d+)%\))?[^\]\n]*?CN:(\d+)\s+DL:([\d.]+[KMGT]?i?B)/g)];
    const r=matches.at(-1);
    if(r)m={completed:logBytes(r[1]),total:logBytes(r[2]),connections:Number(r[4]),speed:logBytes(r[5]),files:[],approximate:true};
    else{const line=(task.progress||'').split(/[\r\n]/).filter(l=>/\[download\]\s+[\d.]+%/.test(l)).at(-1)||'';const p=line.match(/([\d.]+)%/),total=line.match(/of\s+~?\s*([\d.]+[KMGT]?i?B)/),speed=line.match(/at\s+([\d.]+[KMGT]?i?B)\/s/);m={percent:p?Number(p[1]):null,total:total?logBytes(total[1]):0,speed:speed?logBytes(speed[1]):undefined,files:[],approximate:true};m.completed=m.total*(m.percent||0)/100;}
  }
  m={...m};if(task.state!=='running')m.speed=0;if(task.state==='completed'&&m.total)m.completed=m.total;
  m.percent=task.state==='completed'?100:m.total>0?Math.min(100,100*m.completed/m.total):m.percent??null;
  m.eta=m.speed>0&&m.total>0?(m.total-m.completed)/m.speed:null;
  return m;
}
function taskNode(tag,className,text){const n=document.createElement(tag);if(className)n.className=className;if(text!==undefined)n.textContent=text;return n;}
function refreshTaskSelection(){
  const count=visibleTasks.filter(t=>selectedTasks.has(t.id)).length;
  const label=document.getElementById('batchCount');if(label)label.textContent=`已选 ${count} 项`;
  for(const name of ['Pause','Resume','Delete']){const b=document.getElementById('batch'+name);if(b)b.disabled=batchBusy||!visibleTasks.some(t=>selectedTasks.has(t.id)&&!pendingTaskActions.has(t.id)&&(name==='Delete'||(name==='Pause'?taskCanPause(t):taskCanResume(t))));}
  const all=document.getElementById('taskSelectAll');if(all){all.checked=!!visibleTasks.length&&count===visibleTasks.length;all.indeterminate=count>0&&count<visibleTasks.length;}
}
function setupTaskBatch(items,send,poll){
  visibleTasks=items;
  let bar=document.getElementById('taskBatch');
  if(!bar){
    bar=taskNode('details','task-batch-panel');bar.id='taskBatch';bar.append(taskNode('summary','','批量操作（可选）'));
    bar.addEventListener('toggle',()=>document.getElementById('tasksList').classList.toggle('batch-selecting',bar.open));
    const label=taskNode('label','task-check'),all=document.createElement('input');all.type='checkbox';all.id='taskSelectAll';label.append(all,document.createTextNode('选择当前列表'));bar.append(label);
    all.addEventListener('change',()=>{visibleTasks.forEach(t=>all.checked?selectedTasks.add(t.id):selectedTasks.delete(t.id));poll();refreshTaskSelection();});
    for(const [name,title,action] of [['Pause','暂停','video-pause'],['Resume','继续','video-resume'],['Delete','删除','video-delete']]){
      const b=taskNode('button','',title);b.id='batch'+name;
      b.addEventListener('click',async()=>{
        const list=visibleTasks.filter(t=>selectedTasks.has(t.id)&&!pendingTaskActions.has(t.id)&&(name==='Delete'||(name==='Pause'?taskCanPause(t):taskCanResume(t))));
        batchBusy=true;list.forEach(t=>pendingTaskActions.add(t.id));refreshTaskSelection();const errors=[];
        try{for(const task of list){try{await send(action,{id:task.id});if(name==='Delete')selectedTasks.delete(task.id);}catch(e){errors.push(e.message);}}}
        finally{list.forEach(t=>pendingTaskActions.delete(t.id));batchBusy=false;await poll();refreshTaskSelection();document.getElementById('tasksError').textContent=errors.length?errors.join('\n'):list.length?'': '所选任务没有可执行此操作的项目。';}
      });bar.append(b);
    }
    const count=taskNode('span');count.id='batchCount';bar.append(count);document.getElementById('tasksList').before(bar);
  }
  refreshTaskSelection();
}
function renderTaskCard(task,send,poll){
  const m=taskMetrics(task),card=taskNode('article','download-task monitor-card');
  const heading=taskNode('div','monitor-heading'),check=document.createElement('input');check.type='checkbox';check.className='task-selection';check.checked=selectedTasks.has(task.id);check.setAttribute('aria-label','选择任务 '+(task.title||task.id));check.addEventListener('change',()=>{check.checked?selectedTasks.add(task.id):selectedTasks.delete(task.id);refreshTaskSelection();});
  heading.append(check,taskNode('p','monitor-title',task.title||(typeof Recovery!=='undefined'?Recovery.redact(task.source):task.source)||'下载任务'));card.append(heading);
  const state=({queued:'排队中',starting:'准备中',running:'下载中 / 处理中',paused:'已暂停',failed:'已中断',completed:'已完成'})[task.state]||task.state;
  const topline=taskNode('div','monitor-topline');topline.append(taskNode('span','state-chip '+task.state,state),taskNode('strong','monitor-percent',m.percent===null?'准备连接':m.percent.toFixed(1)+'%'));card.append(topline);
  const track=taskNode('div','monitor-track'),fill=taskNode('span');track.setAttribute('role','progressbar');track.setAttribute('aria-label','下载进度');track.setAttribute('aria-valuemin','0');track.setAttribute('aria-valuemax','100');if(m.percent!==null)track.setAttribute('aria-valuenow',String(m.percent));else track.classList.add('indeterminate');fill.style.width=(m.percent??25)+'%';track.append(fill);card.append(track);
  const amount=taskNode('p','monitor-amount',m.total?`${m.approximate?'约 ':''}${formatBytes(m.completed)} / ${formatBytes(m.total)}`:task.state==='completed'?'文件已保存':'等待引擎返回文件大小');card.append(amount);
  const stats=taskNode('div','monitor-stats');
  for(const [label,value] of [['速度',m.speed===undefined?'—':formatBytes(m.speed)+'/s'],['剩余',task.state==='completed'?'已完成':formatEta(m.eta)],['连接',m.connections===undefined?'—':task.state==='running'?String(m.connections):'0']]){const item=taskNode('div');item.append(taskNode('span','',label),taskNode('strong','',value));stats.append(item);}card.append(stats);
  if((m.phase||task.phase)&&task.state==='running')card.append(taskNode('p','monitor-note',m.phase||task.phase));
  if(task.probeSummary?.total){const p=task.probeSummary;card.append(taskNode('p','monitor-note',`探测 ${p.success}/${p.total} 个文件 · ${p.ranges} 个支持分段`));}
  if(task.recoveryNote)card.append(taskNode('p','monitor-note',task.recoveryNote));
  if(task.validation&&task.state==='completed')card.append(taskNode('p','monitor-note',task.validation));
  if(task.companionStatus){
    const label=task.state==='completed'?'视频已完成 · ':'';
    const detail=task.companionStatus==='complete'?'配套资料已保存':task.companionStatus==='partial'?'配套资料部分失败':'配套资料待保存';
    card.append(taskNode('p','monitor-note companion-task-status',label+detail));
    if(task.companionStatus==='partial'&&task.companionError)card.append(taskNode('p','task-error',task.companionError));
  }
  if(task.libraryWarning)card.append(taskNode('p','task-error',task.libraryWarning+'；可重试配套资料以更新索引。'));
  const segments=taskNode('details','segment-details');segments.open=expandedTasks.has(task.id);segments.addEventListener('toggle',()=>{segments.open?expandedTasks.add(task.id):expandedTasks.delete(task.id);});segments.append(taskNode('summary','','分段进度与日志'));
  const files=(m.files||[]).filter(f=>f.groups?.length);
  const panel=taskNode('div','segment-panel'+(m.source==='range64'?' native-ranges':''));
  const caption=taskNode('div','segment-caption');caption.append(taskNode('strong','','分段下载'),taskNode('span','',m.connections===undefined?'连接数待获取':`${task.state==='running'?m.connections:0} 个连接`));panel.append(caption);
  if(files.length){
    for(const file of files){
      panel.append(taskNode('p','segment-name',file.name));
      const meta=taskNode('div','segment-meta');meta.append(taskNode('span','',`${file.groups.length} 个文件区间`),taskNode('span','',`${file.groups.filter(g=>g.percent>=100).length} 个完成`));panel.append(meta);
      const rows=taskNode('div','segment-rows');
      file.groups.forEach((group,index)=>{
        const percent=Math.max(0,Math.min(100,Number(group.percent)||0));
        const row=taskNode('div','segment-row'+(percent>=100?' complete':''));
        const label=taskNode('span','segment-index',String(index+1).padStart(2,'0'));
        const range=formatBytes(group.start)+' – '+formatBytes(group.end);row.title=range+' · '+percent.toFixed(1)+'%';
        const meter=taskNode('div','segment-meter'),bar=taskNode('span');bar.style.width=percent+'%';meter.append(bar);
        meter.setAttribute('role','progressbar');meter.setAttribute('aria-label',`区间 ${index+1}，${range}`);meter.setAttribute('aria-valuemin','0');meter.setAttribute('aria-valuemax','100');meter.setAttribute('aria-valuenow',String(percent));
        row.append(label,meter,taskNode('span','segment-value',percent>=100?'完成':m.source==='range64'&&group.active?formatBytes(Number(group.speed)||0)+'/s':percent.toFixed(1)+'%'));rows.append(row);
      });panel.append(rows);
    }
    panel.append(taskNode('p','segment-explanation',m.source==='range64'?'按文件区间汇总真实速度和已收字节，最多 64 个区间；悬停查看位置和百分比。':'按文件位置汇总已完成分片；区间数不代表连接数。悬停可查看位置范围。'));
  }else panel.append(taskNode('p','segment-empty','等待引擎提供分段数据。当前任务的总进度仍在上方显示。'));
  const footer=taskNode('div','segment-footer');
  const rate=taskNode('span');rate.append(document.createTextNode('总速度 '),taskNode('strong','',m.speed===undefined?'—':formatBytes(m.speed)+'/s'));
  const remaining=taskNode('span');remaining.append(document.createTextNode('剩余 '),taskNode('strong','',task.state==='completed'?'已完成':formatEta(m.eta)));footer.append(rate,remaining);panel.append(footer);segments.append(panel);
  const logs=taskNode('details','task-log-details');logs.open=expandedLogs.has(task.id);logs.addEventListener('toggle',()=>{logs.open?expandedLogs.add(task.id):expandedLogs.delete(task.id);});
  logs.append(taskNode('summary','','原始下载日志'),taskNode('pre','monitor-log',typeof Recovery!=='undefined'?Recovery.redact(task.progress||'暂无日志'):task.progress||'暂无日志'));segments.append(logs);card.append(segments);
  if(task.error){const problem=taskNode('div','task-error');if(typeof renderTaskRecovery==='function')renderTaskRecovery(problem,task,send,poll);else problem.textContent=typeof Recovery!=='undefined'?Recovery.redact(task.error):task.error;card.append(problem);}
  const actions=taskNode('div','task-actions');
  for(const [label,action,shown] of [['暂停','video-pause',taskCanPause(task)],['继续','video-resume',taskCanResume(task)],['重试配套资料','video-companion-retry',task.companionRetryable===true],['打开目录','video-open-task',true],['删除','video-delete',true]]){
    if(!shown)continue;const b=taskNode('button','',label);b.disabled=pendingTaskActions.has(task.id);b.dataset.action=action;
    if(action==='video-delete')b.title=taskCanPause(task)?'停止此任务并删除记录，保留已下载文件':'删除此任务记录，保留已下载文件';
    b.addEventListener('click',async()=>{
      if(pendingTaskActions.has(task.id))return;
      pendingTaskActions.add(task.id);actions.querySelectorAll('button').forEach(n=>n.disabled=true);refreshTaskSelection();
      const error=document.getElementById('tasksError');error.textContent='';
      try{await send(action,{id:task.id});}catch(e){if(typeof Recovery!=='undefined')Recovery.setError(error,e);else error.textContent=e.message;}
      finally{pendingTaskActions.delete(task.id);const message=error.textContent;await poll();if(message)error.textContent=message;actions.querySelectorAll('button').forEach(n=>n.disabled=false);refreshTaskSelection();}
    });actions.append(b);
  }
  card.append(actions,taskNode('p','monitor-time',task.createdAt?new Date(task.createdAt).toLocaleString('zh-CN',{hour12:false}):''));return card;
}

function focusTaskList(){document.getElementById("tasksList")?.scrollIntoView({behavior:"smooth",block:"start"});}

// Explicit refreshes announce their state; background progress polling stays quiet.
function setTaskListLoading(loading){
  const byId=id=>document.getElementById(id), indicator=byId('tasksLoading');
  if(!indicator)return;
  indicator.hidden=!loading;
  if(loading){const filter=byId('taskFilter');indicator.lastElementChild.textContent='正在加载“'+filter.selectedOptions[0].textContent+'”任务…';}
  byId('tasksList').setAttribute('aria-busy',String(loading));
  byId('tasksList').classList.toggle('is-loading',loading);
  byId('tasksList').inert=loading;
  byId('tasksSummary').hidden=loading;
  byId('refreshTasks').disabled=loading;
  const refresh=byId('refreshTasks');refresh.setAttribute('aria-label',loading?'正在加载任务':'刷新任务');refresh.title=loading?'正在加载任务':'刷新任务';refresh.setAttribute('aria-busy',String(loading));
  for(const id of ['tasksPrevious','tasksNext'])byId(id).inert=loading;
  document.querySelectorAll('.task-batch-panel').forEach(panel=>panel.inert=loading);
}
