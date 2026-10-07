function biliCookieText(cookies, now = Date.now() / 1000, site = 'bilibili') {
  const domain = site === 'x' ? 'x.com' : site === 'youtube' ? 'youtube.com' : site === 'toutiao' ? 'toutiao.com' : site === 'xiaohongshu' ? 'xiaohongshu.com' : site === 'bilibili' ? 'bilibili.com' : '';
  if (!domain) throw Error('不支持此网站的登录态');
  const selected = cookies.filter(c => (c.domain.replace(/^\./, '').toLowerCase() === domain || c.domain.toLowerCase().endsWith('.' + domain)) && !c.partitionKey && (c.session || c.expirationDate > now));
  if (!selected.some(c => (site === 'x' ? c.name==='auth_token' : site === 'youtube' ? ['SID','SAPISID','__Secure-3PAPISID','__Secure-1PAPISID'].includes(c.name) : site === 'toutiao' ? ['ttwid','sessionid','sessionid_ss'].includes(c.name) : c.name === (site === 'bilibili' ? 'SESSDATA' : 'web_session')) && c.value)) throw Error('当前浏览器尚未登录此网站，或登录已过期。请登录后再次获取。');
  const lines = selected.map(c => {
    const fields = [(c.httpOnly ? '#HttpOnly_' : '') + c.domain, c.hostOnly ? 'FALSE' : 'TRUE', c.path, c.secure ? 'TRUE' : 'FALSE', c.session ? '0' : String(Math.floor(c.expirationDate)), c.name, c.value];
    if (fields.some(v => typeof v !== 'string' || /[\t\r\n\0]/.test(v))) throw Error('Cookie 格式无效，请重新登录后重试。');
    return fields.join('\t');
  });
  return '# Netscape HTTP Cookie File\n' + lines.join('\n') + '\n';
}
async function currentBiliCookies(windowId, site = 'bilibili') {
  if (!['bilibili','xiaohongshu','toutiao','youtube','x'].includes(site)) throw Error('请先填写支持的视频网址。');
  if (!Number.isInteger(windowId)) throw Error('无法确定当前浏览器窗口，请重新打开侧边栏。');
  const [tab] = await chrome.tabs.query({active: true, windowId});
  const stores = await chrome.cookies.getAllCookieStores();
  const store = stores.find(s => s.tabIds.includes(tab?.id));
  if (!store) throw Error('无法读取当前窗口登录状态，请在普通浏览器窗口中重试。');
  return biliCookieText(await chrome.cookies.getAll({domain: site === 'x' ? 'x.com' : site === 'youtube' ? 'youtube.com' : site === 'toutiao' ? 'toutiao.com' : site === 'bilibili' ? 'bilibili.com' : 'xiaohongshu.com', storeId: store.id}), Date.now() / 1000, site);
}
