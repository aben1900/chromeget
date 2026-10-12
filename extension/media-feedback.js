(() => {
 // Keep initialization failures visible even if video.js never reaches its click handlers.
 function report(error){
  const node=document.getElementById('error'),status=document.getElementById('status');if(!node)return;
  const reason=String(error?.message||error||'页面脚本未能正常加载');
  const message='界面运行出错，请在 chrome://extensions 重新加载精彩摘录，再关闭并重新打开侧栏。\n原因：'+reason;
  if(status)status.textContent='界面出错';
  if(typeof Recovery!=='undefined')Recovery.setError(node,Error(message));else node.textContent=message;
 }
 window.addEventListener('error',event=>{if(event.message)report(event.error||event.message);});
 window.addEventListener('unhandledrejection',event=>report(event.reason));
})();
