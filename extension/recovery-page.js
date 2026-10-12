(() => {
  const node=id=>document.getElementById(id);
  const setup=()=>chrome.storage.session.set({'show-setup':Date.now()});
  const source=()=>{const raw=node('url')?.value||node('fileUrl')?.value||'';return typeof webpageUrl==='function'?webpageUrl(raw):'';};
  function click(id){const b=node(id);if(!b||b.disabled)throw Error('此操作暂不可用，请先检查连接或等待当前操作结束');b.click();}
  for(const id of ['error','transferError','tasksError','listError','collectError']){
    Recovery.bind(node(id),error=>{
      const c={hasSource:!!source(),hasTask:!!node('tasksList'),hasPending:!!node('retry')||!!node('checkCollect'),canChooseFolder:!!node('folder')};
      const available={setup:{label:'查看安装与修复步骤',run:setup},source:{label:'打开来源网页',run:()=>chrome.tabs.create({url:source()})},reparse:{label:'重新获取内容',run:()=>click(node('inspect')?'inspect':'probeFile')},'view-tasks':{label:'查看下载任务',run:()=>{node('tasksList')?.scrollIntoView({block:'start'});click('refreshTasks');}},'check-save':{label:'检查 / 重试待保存',run:()=>click(node('retry')?'retry':'checkCollect')},'choose-folder':{label:'重新选择保存目录',run:()=>click('folder')}};
      let ids=Recovery.actionsFor(error,c);if(!ids.length&&Recovery.normalize(error).code==='NETWORK_TEMPORARY'&&node('probeFile'))ids=['reparse'];
      return {detailsOpen:id==='error'&&!!node('inspect'),retention:id==='collectError'?'当前文字仍保留在收集页。':node('tasksList')?'已有下载文件会保留；是否可继续以任务按钮为准。':'请先确认待保存状态，避免重复提交。',actions:ids.filter(key=>available[key]).map(key=>({id:key,...available[key]}))};
    });
  }
  globalThis.renderTaskRecovery=(container,task,send,poll)=>{
    const sourceUrl=webpageUrl(task.source),context={hasTask:true,hasSource:!!sourceUrl,canResume:taskCanResume(task)};
    const available={setup:{label:'查看修复步骤',run:setup},folder:{label:'打开原保存目录',run:()=>send('video-open-task',{id:task.id})},resume:{label:'继续原任务',run:async()=>{await send('video-resume',{id:task.id});await poll();}},source:{label:'打开来源网页',run:()=>chrome.tabs.create({url:sourceUrl})},reparse:{label:'重新获取内容',run:async()=>{const w=await chrome.windows.getCurrent();await chrome.storage.session.set({[`download-link:${w.id}`]:{url:sourceUrl,time:Date.now()},[`app-view:${w.id}`]:'download'});}}};
    Recovery.render(container,task,{retention:Recovery.normalize(task).code==='DISK_FULL'?'清理原磁盘后继续；此操作不会迁移下载片段。':'已保存文件和续传片段会保留。重新获取内容后仍需确认下载。',actions:Recovery.actionsFor(task,context).filter(key=>available[key]).map(key=>({id:key,...available[key]}))});
  };
})();
