(function (root) {
  'use strict';

  function isPublicPageMediaUrl(value) {
    try {
      const url = new URL(value);
      const host = url.hostname.toLowerCase().replace(/\.$/, '');
      if (!/^https?:$/.test(url.protocol) || url.username || url.password || url.port) return false;
      // Literal IPv6 is excluded, including mapped IPv4 and scoped/link-local forms.
      if (host.includes(':') || !host.includes('.') || /(?:^|\.)(?:localhost|local|internal|lan|home)$/.test(host)) return false;
      if (/^\d+(?:\.\d+){3}$/.test(host)) {
        const [a,b] = host.split('.').map(Number);
        if (a===0 || a===10 || a===127 || a>=224 || (a===100 && b>=64 && b<=127) || (a===169 && b===254) || (a===172 && b>=16 && b<=31) || (a===192 && (b===168 || b===0)) || (a===198 && (b===18 || b===19))) return false;
      }
      return true;
    } catch { return false; }
  }

  // Chrome serializes this function. Keep every DOM-side dependency inside it.
  function collectDocumentMedia() {
    function publicUrl(value) {
      try {
        const url = new URL(value, document.baseURI);
        const host = url.hostname.toLowerCase().replace(/\.$/, '');
        if (!/^https?:$/.test(url.protocol) || url.username || url.password || url.port || host.includes(':') || !host.includes('.') || /(?:^|\.)(?:localhost|local|internal|lan|home)$/.test(host)) return '';
        if (/^\d+(?:\.\d+){3}$/.test(host)) {
          const [a,b] = host.split('.').map(Number);
          if (a===0 || a===10 || a===127 || a>=224 || (a===100 && b>=64 && b<=127) || (a===169 && b===254) || (a===172 && b>=16 && b<=31) || (a===192 && (b===168 || b===0)) || (a===198 && (b===18 || b===19))) return '';
        }
        url.hash = '';
        return url.href;
      } catch { return ''; }
    }
    function visible(element) {
      for (let node=element; node && node.nodeType===1; node=node.parentElement) {
        if (node.hidden || node.getAttribute('aria-hidden')==='true') return false;
        const style=getComputedStyle(node);
        if (style.display==='none' || style.visibility==='hidden' || style.visibility==='collapse' || Number(style.opacity)===0 || style.contentVisibility==='hidden') return false;
        const marker=String(node.id||'')+' '+String(node.className||'');
        if (/(?:jingcai|chromeget|clipper)[-_]/i.test(marker) || node.hasAttribute('data-chromeget') || node.hasAttribute('data-jingcai')) return false;
      }
      return element.getClientRects().length>0;
    }
    const images=[], videos=[], imageSeen=new Set(), videoSeen=new Set();
    let scopes=[];
    // A main landmark can contain the content beside unrelated article cards.
    // Prefer the landmark so recommendation cards cannot hide the actual page media.
    for (const selector of ['main','[role="main"]','article']) {
      scopes=Array.from(document.querySelectorAll(selector)).filter(visible);
      if (scopes.length) break;
    }
    if (!scopes.length && document.body) scopes=[document.body];
    const videoPattern=/\.(?:mp4|webm|mov|m4v|ogv)(?:$|[?#])/i;
    function addVideo(value, type, label) {
      if (videos.length>=30) return;
      const url=publicUrl(value);
      if (!url || !videoPattern.test(new URL(url).pathname) || videoSeen.has(url)) return;
      videoSeen.add(url);videos.push({url,type:String(type||'video').slice(0,80),label:String(label||'网页视频').trim().slice(0,200)});
    }
    for (const scope of scopes) {
      for (const img of scope.querySelectorAll('img')) {
        if (images.length>=100) break;
        if (!visible(img) || img.closest('nav,header,footer,aside,[role="navigation"]')) continue;
        const marker=[img.id,img.className,img.alt,img.getAttribute('src'),img.parentElement?.className].join(' ');
        if (/(?:^|[\s/_.-])(?:avatar|avatars|icon|icons|logo|logos|badge|badges|emoji|emojis|tracking|spacer)(?:$|[\s/_.-])/i.test(marker)) continue;
        const rect=img.getBoundingClientRect();
        if (rect.width<80 || rect.height<60) continue;
        const width=Number(img.naturalWidth)||Number(img.getAttribute('width'))||Math.round(rect.width);
        const height=Number(img.naturalHeight)||Number(img.getAttribute('height'))||Math.round(rect.height);
        // Use the browser-selected responsive image; lazy attributes only fill a placeholder.
        const selected=img.currentSrc || img.getAttribute('src') || '';
        let value=selected;
        const placeholder=!selected || /^(?:data:|blob:|about:)/i.test(selected) || (img.naturalWidth>0 && img.naturalWidth<=2 && img.naturalHeight<=2);
        if (placeholder) {
          const lazy=img.getAttribute('data-src') || img.getAttribute('data-lazy-src') || img.getAttribute('data-original');
          if (!lazy && img.naturalWidth>0 && img.naturalWidth<=2 && img.naturalHeight<=2) continue;
          value=lazy || selected;
        }
        const url=publicUrl(value);
        if (!url || /\.svgz?$/i.test(new URL(url).pathname) || imageSeen.has(url)) continue;
        if (!placeholder && (width<80 || height<60)) continue;
        imageSeen.add(url);images.push({url,width:placeholder ? Number(img.getAttribute('width'))||Math.round(rect.width) : width,height:placeholder ? Number(img.getAttribute('height'))||Math.round(rect.height) : height});
      }
      for (const video of scope.querySelectorAll('video')) {
        if (!visible(video)) continue;
        addVideo(video.currentSrc || video.getAttribute('src'),video.getAttribute('type'),video.title);
        for (const item of video.querySelectorAll('source[src]')) addVideo(item.getAttribute('src'),item.type,video.title);
      }
      for (const link of scope.querySelectorAll('a[href]')) {
        if (visible(link)) addVideo(link.href,'video',link.textContent);
      }
    }
    const result={url:location.href,title:document.title,images,videos};
    if (location.hostname==='huggingface.co' && /^\/[^/]+\/[^/]+\/?$/.test(location.pathname) && !images.length && !videos.length) result.modelRepoUrl=location.origin+location.pathname;
    return result;
  }

  async function collectPageMedia(windowId, expectedUrl) {
    const changed='当前标签页已变化。请切回要获取媒体的页面，再点击获取。';
    const normalized=value=>{try {const url=new URL(value);url.hash='';return url.href;}catch{return '';}};
    if (!Number.isInteger(windowId) || windowId<0) return {ok:false,error:'无法确定当前浏览器窗口，请重新打开侧栏后重试。'};
    if (!isPublicPageMediaUrl(expectedUrl)) return {ok:false,error:'仅支持公开的 HTTP/HTTPS 网页，请打开目标网页后重试。'};
    const expected=normalized(expectedUrl);
    try {
      const tabs=await chrome.tabs.query({active:true,windowId});
      const tab=tabs.find(item=>item.windowId===windowId);
      if (!tab || !Number.isInteger(tab.id) || normalized(tab.url)!==expected || tab.pendingUrl && normalized(tab.pendingUrl)!==expected) return {ok:false,error:changed};
      const results=await chrome.scripting.executeScript({target:{tabId:tab.id,frameIds:[0]},func:collectDocumentMedia});
      const captured=results.find(item=>item.frameId===0)?.result;
      const current=await chrome.tabs.get(tab.id);
      if (!captured || normalized(captured.url)!==expected || normalized(current.url)!==expected || current.windowId!==windowId || current.active===false || current.pendingUrl && normalized(current.pendingUrl)!==expected) return {ok:false,error:changed};
      const images=(Array.isArray(captured.images)?captured.images:[]).filter(item=>isPublicPageMediaUrl(item?.url)).slice(0,100);
      const videos=(Array.isArray(captured.videos)?captured.videos:[]).filter(item=>isPublicPageMediaUrl(item?.url)).slice(0,30);
      return {ok:true,url:captured.url,title:String(captured.title||'').slice(0,500),images,videos,...(captured.modelRepoUrl===expected?{modelRepoUrl:captured.modelRepoUrl}:{})};
    } catch (error) {
      if (/permission|cannot access|not allowed|missing host|cannot be scripted/i.test(String(error?.message||error))) return {ok:false,error:'需要此网站的访问权限。请允许访问后，再点击获取视频/图集。'};
      return {ok:false,error:'无法读取当前网页。请确认页面已加载，刷新后重试。'};
    }
  }

  root.collectPageMedia=collectPageMedia;
  if (typeof module!=='undefined' && module.exports) module.exports={collectPageMedia,collectDocumentMedia,isPublicPageMediaUrl};
})(globalThis);
