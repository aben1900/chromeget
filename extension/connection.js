(() => {
  const box=document.getElementById('connectionPanel'),summary=document.getElementById('connectionSummary'),list=document.getElementById('connectionChecks'),button=document.getElementById('checkConnection');
  let generation=0;
  document.getElementById('connectionId').value=chrome.runtime.id;
  document.getElementById('copyConnectionId').addEventListener('click',async()=>{
    const input=document.getElementById('connectionId');try{await navigator.clipboard.writeText(chrome.runtime.id);document.getElementById('copyHint').textContent='扩展 ID 已复制';}catch{input.focus();input.select();document.getElementById('copyHint').textContent='请按 Ctrl+C 复制已选中的 ID';}
  });
  async function check(){
    const token=++generation;button.disabled=true;summary.textContent='正在检查连接…';
    try{
      const r=await chrome.runtime.sendMessage({action:'check-connection'});if(token!==generation)return;
      list.replaceChildren();
      for(const c of r?.checks||[]){const row=document.createElement('li');row.dataset.check=c.id;row.dataset.state=c.state;row.textContent=(c.state==='pass'?'✓ ':c.state==='fail'?'! ':'○ ')+c.message;list.append(row);}
      const failures=r?.checks?.some(c=>c.state==='fail');
      summary.textContent=!r?.connected?'尚未连接 · 查看安装步骤':failures?'已连接 · 有项目需要处理':'已连接 · 可以开始收集';
      if(!r?.connected||failures)box.open=true;
    }catch{summary.textContent='连接检查未完成 · 请重试';box.open=true;}finally{if(token===generation)button.disabled=false;}
  }
  button.addEventListener('click',check);
  chrome.storage.onChanged.addListener((changes,area)=>{if(area==='session'&&changes['show-setup']){box.open=true;box.scrollIntoView({block:'start'});}});
  check();
})();
