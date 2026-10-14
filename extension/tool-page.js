(() => {
 if (window.parent !== window) {
  document.documentElement.dataset.toolEmbedded = 'true';
  return;
 }
 document.documentElement.dataset.toolStandalone = 'true';
 const header = document.createElement('header');
 header.className = 'tool-page-header';
 const title = document.createElement('strong');
 title.textContent = document.title.startsWith('翻译') ? '比对翻译页' : document.title.startsWith('判定可用') ? '判定可用' : '模型设置';
 const actions = document.createElement('div');
 actions.className = 'tool-page-actions';
 const fullscreen = document.createElement('button');
 fullscreen.type = 'button';
 fullscreen.dataset.toolFullscreen = '';
 const maximizeSvg = expanded => `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${expanded ? 'M8 8h13v13H8zM3 16V3h13' : 'M3 3h18v18H3z'}"/></svg>`;
 function updateMaximize() {
  const expanded = !!document.fullscreenElement;
  fullscreen.title = fullscreen.ariaLabel = expanded ? '恢复窗口' : '最大化';
  fullscreen.setAttribute('aria-pressed', String(expanded));
  fullscreen.innerHTML = maximizeSvg(expanded);
 }
 updateMaximize();
 const close = document.createElement('button');
 close.type = 'button';
 close.dataset.toolClose = '';
 close.title = close.ariaLabel = '关闭';
 close.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 5l14 14M19 5 5 19"/></svg>';
 fullscreen.addEventListener('click', async () => {
  try {
   if (document.fullscreenElement) await document.exitFullscreen();
   else await document.documentElement.requestFullscreen();
  } catch {}
 });
 document.addEventListener('fullscreenchange', updateMaximize);
 close.addEventListener('click', async () => {
  try {
   const tab = await chrome.tabs.getCurrent();
   if (tab?.id) { await chrome.tabs.remove(tab.id); return; }
  } catch {}
  window.close();
 });
 actions.append(fullscreen, close);
 header.append(title, actions);
 document.body.prepend(header);
})();
