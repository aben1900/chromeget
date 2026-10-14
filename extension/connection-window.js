(() => {
 const token=new URL(location.href).searchParams.get('token');
 fetch('app.html').then(r=>r.text()).then(html=>{
  const source=new DOMParser().parseFromString(html,'text/html').getElementById('connectionDialog');
  if(!source)throw Error('检查界面未找到');
  const dialog=document.importNode(source,true);document.body.append(dialog);
  dialog.querySelector('[data-close-dialog="connectionDialog"]')?.remove();
  dialog.querySelector('#connectionTitle')?.remove();dialog.removeAttribute('aria-labelledby');dialog.setAttribute('aria-label','判定可用');
  dialog.addEventListener('close',()=>{if(window.parent!==window)window.parent.postMessage({type:'chromeget-connection-close',token},'*');else if(chrome.tabs?.getCurrent)chrome.tabs.getCurrent().then(tab=>tab?.id?chrome.tabs.remove(tab.id):window.close()).catch(()=>window.close());else window.close()});
  if(new URL(location.href).searchParams.has('guide'))dialog.querySelector('#setupGuide').open=true;
  const script=document.createElement('script');script.src='connection.js';document.body.append(script);dialog.show();
  if(window.parent!==window&&token){const observer=new ResizeObserver(()=>window.parent.postMessage({type:'chromeget-connection-size',token,height:Math.ceil(Math.max(dialog.scrollHeight,dialog.getBoundingClientRect().height))},'*'));observer.observe(dialog)}
  document.addEventListener('keydown',event=>{if(event.key==='Escape')dialog.close()});
 }).catch(error=>{document.body.textContent='检查窗口无法打开：'+error.message});
})();
