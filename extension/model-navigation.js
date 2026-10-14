(() => {
 const opening = new Set();
 function report(button, id, label, error) {
  let status = document.getElementById(id);
  if (!status) {
   status = document.createElement('p');
   status.id = id;
   status.setAttribute('role', 'alert');
   button.parentElement.after(status);
  }
  status.textContent = `无法打开${label}：${error.message || error}`;
 }
 async function open(button, tool, label, statusId) {
  if (button.disabled || opening.has(tool)) return;
  opening.add(tool);
  button.disabled = true;
  try {
   const result = await chrome.runtime.sendMessage({action: 'open-tool-overlay', tool});
   if (!result?.ok) throw new Error(result?.error || '当前网页无法显示');
   if (result.render) {
    const {url, token, tool: renderedTool, title} = result.render;
    try {
     if (typeof OverlayWindowRender !== 'function') throw new Error('窗口组件未加载');
     OverlayWindowRender(url, token, renderedTool, title);
    } catch (error) {
     await chrome.runtime.sendMessage({action: 'close-tool-overlay', token}).catch(() => {});
     throw error;
    }
   }
   const status = document.getElementById(statusId);
   if (status) status.textContent = '';
  } catch (error) {
   report(button, statusId, label, error);
  } finally {
   opening.delete(tool);
   const engine = button.dataset.modelEngine && document.getElementById(button.dataset.modelEngine);
   button.disabled = !!engine && (engine.value !== 'model' || engine.disabled);
  }
 }
 for (const button of document.querySelectorAll('[data-model-settings]')) {
  button.addEventListener('click', () => open(button, 'model', '模型设置', 'modelNavigationStatus'));
 }
 for (const button of document.querySelectorAll('[data-translation]')) {
  button.addEventListener('click', () => open(button, 'translate', '比对翻译', 'translationNavigationStatus'));
 }
})();
