// Kept self-contained so Chrome can serialize this function for executeScript.
function OverlayWindowRender(url, token, tool, title) {
  const kind = String(tool || 'tool');
  const maximizeSvg = expanded => `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${expanded ? 'M8 8h13v13H8zM3 16V3h13' : 'M3 3h18v18H3z'}"/></svg>`;
  for (const old of document.querySelectorAll('[data-chromeget-tool-overlay]')) {
    if (old.dataset.chromegetToolOverlay === kind) old.dispatchEvent(new Event('chromeget-overlay-close'));
  }
  const host = document.createElement('div');
  host.dataset.chromegetToolOverlay = kind;
  if (kind === 'connection') host.dataset.chromegetConnectionReview = token;
  const shadow = host.attachShadow({mode: 'closed'});
  const sheet = new CSSStyleSheet();
  sheet.replaceSync(`
    :host{all:initial}
    dialog{box-sizing:border-box;display:flex;flex-direction:column;width:min(var(--tool-width),calc(100vw - 24px));height:min(var(--tool-height),calc(100vh - 24px));max-width:none;max-height:calc(100vh - 24px);margin:auto;padding:0;border:0;border-radius:14px;overflow:hidden;background:#fff;color:#263449;box-shadow:0 18px 56px #0d1c3552;font:14px/1.4 "Segoe UI","Microsoft YaHei",sans-serif}
    dialog::backdrop{background:#13213b66}
    dialog:focus{outline:none}
    dialog.fullscreen{width:100vw;height:100vh;max-height:none;border-radius:0;box-shadow:none}
    header{box-sizing:border-box;display:flex;align-items:center;justify-content:space-between;gap:12px;flex:none;height:52px;padding:0 16px 0 22px;border-bottom:1px solid #e5eaf0;background:#fff}
    header strong{font-size:18px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .actions{display:flex;align-items:center;gap:4px}
    button{display:grid;place-items:center;width:34px;height:34px;padding:6px;border:0;border-radius:8px;background:transparent;color:#4e6076;cursor:pointer}
    button:hover{background:#e9eef5;box-shadow:inset 0 2px 4px #0002}
    button:active{background:#dce5ef;box-shadow:inset 0 3px 5px #0003}
    button:focus-visible{outline:2px solid #416fc4;outline-offset:1px}
    button svg{display:block;width:20px;height:20px;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}
    button[data-overlay-fullscreen] svg{width:18px;height:18px;stroke-width:1.7}
    iframe{display:block;flex:1;min-height:0;width:100%;border:0;background:#fff}
    @media(max-width:600px){header{height:46px;padding-left:14px}header strong{font-size:16px}}
  `);
  shadow.adoptedStyleSheets = [sheet];
  const dialog = document.createElement('dialog');
  dialog.tabIndex = -1;
  dialog.style.setProperty('--tool-width', kind === 'model' ? '960px' : kind === 'translate' ? '1100px' : '1120px');
  dialog.style.setProperty('--tool-height', kind === 'model' ? '800px' : kind === 'translate' ? '760px' : '780px');
  const header = document.createElement('header');
  const label = document.createElement('strong');
  label.textContent = title || '精彩摘录';
  const actions = document.createElement('div');
  actions.className = 'actions';
  const fullscreen = document.createElement('button');
  fullscreen.type = 'button';
  fullscreen.dataset.overlayFullscreen = '';
  fullscreen.title = fullscreen.ariaLabel = '最大化';
  fullscreen.setAttribute('aria-pressed', 'false');
  fullscreen.innerHTML = maximizeSvg(false);
  const closeButton = document.createElement('button');
  closeButton.type = 'button';
  closeButton.dataset.overlayClose = '';
  closeButton.title = closeButton.ariaLabel = '关闭';
  closeButton.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 5l14 14M19 5 5 19"/></svg>';
  const frame = document.createElement('iframe');
  frame.src = url;
  frame.title = title || '精彩摘录';
  frame.setAttribute('referrerpolicy', 'no-referrer');
  actions.append(fullscreen, closeButton);
  header.append(label, actions);
  dialog.append(header, frame);
  shadow.append(dialog);
  document.documentElement.append(host);
  dialog.showModal();
  dialog.focus({preventScroll: true});
  let closed = false;
  let contentHeight = 0;
  function close() {
    if (closed) return;
    closed = true;
    window.removeEventListener('message', onMessage);
    host.removeEventListener('chromeget-overlay-close', close);
    dialog.close();
    host.remove();
    if (kind !== 'connection' && globalThis.chrome?.runtime?.sendMessage) {
      Promise.resolve(chrome.runtime.sendMessage({action: 'close-tool-overlay', token})).catch(() => {});
    }
  }
  function onMessage(event) {
    if (event.source !== frame.contentWindow || event.data?.token !== token) return;
    if (event.data.type === 'chromeget-connection-close') close();
    if (event.data.type === 'chromeget-connection-size' && Number.isFinite(event.data.height)) {
      contentHeight = Math.min(Math.max(360, event.data.height + 52), window.innerHeight - 24);
      if (!dialog.classList.contains('fullscreen')) dialog.style.height = contentHeight + 'px';
    }
  }
  fullscreen.addEventListener('click', () => {
    const active = dialog.classList.toggle('fullscreen');
    fullscreen.title = fullscreen.ariaLabel = active ? '恢复窗口' : '最大化';
    fullscreen.setAttribute('aria-pressed', String(active));
    fullscreen.innerHTML = maximizeSvg(active);
    dialog.style.height = active ? '' : contentHeight ? contentHeight + 'px' : '';
  });
  closeButton.addEventListener('click', close);
  host.addEventListener('chromeget-overlay-close', close);
  window.addEventListener('message', onMessage);
  dialog.addEventListener('cancel', event => { event.preventDefault(); close(); });
  dialog.addEventListener('click', event => { if (event.target === dialog) close(); });
  return true;
}

// Extension-owned tabs can host the same panel without scripting into their URL.
if (typeof document !== 'undefined' && window.top === window && typeof BroadcastChannel !== 'undefined' && globalThis.chrome?.tabs?.getCurrent && chrome.runtime?.getURL) {
  const channel = new BroadcastChannel('chromeget-connection-overlay');
  const pending = new Map();
  channel.addEventListener('message', async event => {
    const request = event.data;
    if (typeof request?.token !== 'string') return;
    if (request.type === 'commit') {
      const prepared = pending.get(request.token);
      pending.delete(request.token);
      if (!prepared || Date.now() - prepared.createdAt > 5000) return;
      try {
        const url = prepared.tool === 'connection'
          ? chrome.runtime.getURL('connection-window.html') + '?token=' + encodeURIComponent(request.token) + (prepared.guide ? '&guide=1' : '')
          : prepared.url;
        OverlayWindowRender(url, request.token, prepared.tool, prepared.title);
        channel.postMessage({type: 'opened', token: request.token});
      } catch { channel.postMessage({type: 'failed', token: request.token}); }
      return;
    }
    if (request.type !== 'prepare' || !Number.isInteger(request.tabId)) return;
    try {
      const tab = await chrome.tabs.getCurrent();
      if (tab?.id !== request.tabId) return;
      const tool = request.tool || 'connection';
      if (!['connection', 'model', 'translate'].includes(tool)) return;
      if (tool !== 'connection') {
        const page = tool === 'model' ? 'model-settings.html' : 'translate.html';
        if (!request.url?.startsWith(chrome.runtime.getURL(page) + '?overlay=' + encodeURIComponent(request.token))) return;
      }
      pending.set(request.token, {guide: request.guide, tool, url: request.url, title: request.title || '精彩摘录', createdAt: Date.now()});
      channel.postMessage({type: 'ready', token: request.token});
    } catch {}
  });
}
