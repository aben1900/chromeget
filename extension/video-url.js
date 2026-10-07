function biliVideoUrl(value) {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || !['www.bilibili.com','bilibili.com','m.bilibili.com'].includes(url.hostname) || url.username || url.password || url.port || !/^\/(video\/(BV[0-9A-Za-z]+|av\d+)|bangumi\/play\/(ep|ss)\d+)\/?$/.test(url.pathname)) return '';
    url.hash = '';
    return url.href;
  } catch { return ''; }
}
async function currentBiliVideo(windowId) {
  const [tab] = await chrome.tabs.query({active: true, windowId});
  return supportedVideoUrl(tab?.url);
}
function supportedVideoUrl(value) {
  const bili = biliVideoUrl(value);
  if (bili) return bili;
  try {
    const url = new URL(value);
    if (!['https:','http:'].includes(url.protocol) || url.username || url.password || url.port) return '';
    if (['x.com','www.x.com','twitter.com','www.twitter.com','mobile.twitter.com'].includes(url.hostname)) {
      const match=url.pathname.match(/^\/(?:[A-Za-z0-9_]+|i\/web)\/status\/(\d+)(\/video\/\d+)?\/?$/);
      if(!match)return '';return 'https://x.com/i/web/status/'+match[1]+(match[2]||'');
    } else if (['youtube.com','www.youtube.com','m.youtube.com','music.youtube.com','youtu.be','www.youtu.be'].includes(url.hostname)) {
      const id=['youtu.be','www.youtu.be'].includes(url.hostname)?url.pathname.slice(1).replace(/\/$/,''):url.pathname==='/watch'?url.searchParams.get('v'):url.pathname.match(/^\/(?:shorts|live|embed)\/([\w-]{11})\/?$/)?.[1];
      if(!/^[\w-]{11}$/.test(id || '')) return '';
      return 'https://www.youtube.com/watch?v='+id;
    } else if (['www.toutiao.com','toutiao.com','m.toutiao.com'].includes(url.hostname)) {
      const match=url.pathname.match(/^\/(?:video\/|group\/|i)(\d+)\/?$/);
      if(!match) return '';
      url.hostname='www.toutiao.com';url.pathname='/video/'+match[1]+'/';
    } else if (['xhslink.com','www.xhslink.com'].includes(url.hostname)) {
      if (!/^\/(?:[amo]\/)?[A-Za-z0-9]+\/?$/.test(url.pathname)) return '';
    } else if (['www.xiaohongshu.com','xiaohongshu.com'].includes(url.hostname)) {
      const match = url.pathname.match(/^\/(?:explore|discovery\/item|user\/profile\/[a-f0-9]+)\/([a-f0-9]+)\/?$/i);
      if (!match) return '';
      url.hostname = 'www.xiaohongshu.com'; url.pathname = '/explore/' + match[1];
    } else if (['tiktok.com','www.tiktok.com','vm.tiktok.com','vt.tiktok.com','reddit.com','www.reddit.com','old.reddit.com','redd.it','vimeo.com','www.vimeo.com','player.vimeo.com','twitch.tv','www.twitch.tv','clips.twitch.tv'].includes(url.hostname)) {
      if(url.pathname==='/' || /^\/(?:home|popular|explore|directory)\/?$/.test(url.pathname))return '';
    } else return '';
    url.protocol = 'https:'; url.hash = '';
    return url.href;
  } catch { return ''; }
}
function videoSite(value) {
  const url = supportedVideoUrl(value);
  if (!url) return '';
  if(new URL(url).hostname==='x.com') return 'x';
  if(new URL(url).hostname==='www.youtube.com') return 'youtube';
  if(new URL(url).hostname==='www.toutiao.com') return 'toutiao';
  return biliVideoUrl(url) ? 'bilibili' : /(^|\.)(xiaohongshu\.com|xhslink\.com)$/.test(new URL(url).hostname)?'xiaohongshu':'';
}
function webpageUrl(value) {
  try {
    const url = new URL(value);
    return ['https:','http:'].includes(url.protocol) && !url.username && !url.password ? url.href : '';
  } catch { return ''; }
}
function websiteName(value) {
  const valid = webpageUrl(value);
  if (!valid) return '';
  const host = new URL(valid).hostname;
  for (const [domain, name] of [['tiktok.com','TikTok'],['reddit.com','Reddit'],['redd.it','Reddit'],['vimeo.com','Vimeo'],['twitch.tv','Twitch'],['x.com','X'],['twitter.com','X'],['huggingface.co','Hugging Face'],['bilibili.com','B站'],['b23.tv','B站'],['xiaohongshu.com','小红书'],['xhslink.com','小红书'],['toutiao.com','头条'],['toutiao.cn','头条'],['youtube.com','YouTube'],['youtu.be','YouTube']]) {
    if (host === domain || host.endsWith('.' + domain)) return name;
  }
  return host;
}
async function currentWebpage(windowId) {
  const [tab] = await chrome.tabs.query({active: true, windowId});
  return webpageUrl(tab?.url);
}
