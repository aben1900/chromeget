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
  function collectDocumentMedia(mediaKind='all') {
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
        // aria-hidden controls accessibility, not whether an icon is painted.
        if (node.hidden) return false;
        const style=getComputedStyle(node);
        if (style.display==='none' || style.visibility==='hidden' || style.visibility==='collapse' || Number(style.opacity)===0 || style.contentVisibility==='hidden') return false;
        const marker=String(node.id||'')+' '+String(node.getAttribute('class')||'');
        if (/(?:jingcai|chromeget|clipper)[-_]/i.test(marker) || node.hasAttribute('data-chromeget') || node.hasAttribute('data-jingcai')) return false;
      }
      return element.getClientRects().length>0;
    }
    const images=[], videos=[], imageSeen=new Set(), videoSeen=new Set();
    let svgDataLength=0;
    const imagePattern=/\.(jpe?g|gif|png|bmp|svg|webp|ico|tiff?|avif)$/i;
    function imageFormat(url) {
      const ext=new URL(url).pathname.match(imagePattern)?.[1]?.toLowerCase() || '';
      return ext==='jpg' ? 'jpeg' : ext==='tif' ? 'tiff' : ext;
    }
    function addImage(url,width,height,format) {
      if (!url || images.length>=100 || imageSeen.has(url)) return;
      if (url.startsWith('data:')) {
        if (svgDataLength+url.length>512*1024) return;
        svgDataLength+=url.length;
      }
      imageSeen.add(url);images.push({url,width,height,format});
    }
    function passiveSvg(svg) {
      const ns='http://www.w3.org/2000/svg';
      const elements=new Set(['svg','g','defs','symbol','use','path','rect','circle','ellipse','line','polyline','polygon','text','tspan','title','desc','linearGradient','radialGradient','stop','clipPath','mask','pattern']);
      const attrs=new Set(('id x y x1 y1 x2 y2 cx cy r rx ry width height viewBox preserveAspectRatio d points transform fill fill-opacity fill-rule stroke stroke-width stroke-opacity stroke-linecap stroke-linejoin stroke-miterlimit stroke-dasharray stroke-dashoffset opacity color clip-path clip-rule mask vector-effect gradientUnits gradientTransform spreadMethod offset stop-color stop-opacity fx fy fr patternUnits patternContentUnits patternTransform clipPathUnits maskUnits maskContentUnits text-anchor dominant-baseline font-family font-size font-style font-weight letter-spacing word-spacing dx dy rotate textLength lengthAdjust href').split(' '));
      const presentation=('fill fill-opacity fill-rule stroke stroke-width stroke-opacity stroke-linecap stroke-linejoin stroke-miterlimit stroke-dasharray stroke-dashoffset opacity color clip-path clip-rule vector-effect stop-color stop-opacity text-anchor dominant-baseline font-family font-size font-style font-weight letter-spacing word-spacing').split(' ');
      const nonInherited=new Set(['opacity','clip-path','vector-effect','stop-color','stop-opacity']);
      const definitionElements=new Set(['defs','symbol','clipPath','mask','pattern','linearGradient','radialGradient']);
      let nodeCount=0,sourceLength=0;
      function safeValue(name,raw,computed=false) {
        let value=raw.trim();
        sourceLength+=value.length;
        if (sourceLength>128*1024) throw Error('SVG too large');
        if (/[\\<>\u0000-\u001f\u007f]/.test(value) || /@import/i.test(value)) return null;
        if (name==='href' && !/^#[A-Za-z_][\w.:-]*$/.test(value)) return null;
        if (computed && /url\s*\(/i.test(value)) {
          const match=value.match(/^url\(\s*(["']?)(.*?)\1\s*\)$/i);
          if (!match) return null;
          try {
            const ref=new URL(match[2],document.baseURI),page=new URL(location.href);
            const fragment=ref.hash;ref.hash='';page.hash='';
            if (ref.href!==page.href || !/^#[A-Za-z_][\w.:-]*$/.test(fragment)) return null;
            value='url('+fragment+')';
          } catch { return null; }
        }
        // Presentation paint/clip values may reference only a local SVG definition.
        if (/url\s*\(/i.test(value) && !/^url\(\s*#[A-Za-z_][\w.:-]*\s*\)$/i.test(value)) return null;
        return value;
      }
      function clone(node,depth,definition=false) {
        if (++nodeCount>5000 || depth>64) throw Error('SVG too complex');
        if (node.nodeType===3) {
          sourceLength+=node.textContent.length;
          if (sourceLength>128*1024) throw Error('SVG too large');
          return document.createTextNode(node.textContent);
        }
        if (node.nodeType!==1 || node.namespaceURI!==ns || !elements.has(node.localName)) return null;
        definition=definition || definitionElements.has(node.localName);
        const clean=document.createElementNS(ns,node.localName);
        for (const attr of node.attributes) {
          const name=attr.localName;
          if (attr.namespaceURI && !(attr.namespaceURI==='http://www.w3.org/1999/xlink' && name==='href')) continue;
          if (!attrs.has(name)) continue;
          const value=safeValue(name,attr.value);
          if (value!==null) clean.setAttribute(name,value);
        }
        // Freeze passive paint/font values so stylesheet-only icons remain visible.
        // Definitions retain inherited paint for their <use> instance instead of
        // forcing the default paint of their hidden sprite-sheet container.
        const style=getComputedStyle(node),parentStyle=node!==svg && node.parentElement ? getComputedStyle(node.parentElement) : null;
        for (const name of presentation) {
          const raw=style.getPropertyValue(name);
          if (!raw || parentStyle && raw===parentStyle.getPropertyValue(name) && !nonInherited.has(name) && !clean.hasAttribute(name)) continue;
          if (definition && /^(?:fill|stroke)$/.test(name) && node.getAttribute(name)?.trim().toLowerCase()==='currentcolor' && raw===style.color) continue;
          const value=safeValue(name,raw,true);
          if (value!==null) clean.setAttribute(name,value);
        }
        for (const child of node.childNodes) {
          const safe=clone(child,depth+1,definition);
          if (safe) clean.appendChild(safe);
        }
        return clean;
      }
      try {
        const clean=clone(svg,0);
        if (!clean) return '';
        // Sprite sheets often keep symbol/paint definitions in a separate hidden SVG.
        // Resolve only local fragments through the same sanitizer, never through fetch.
        const knownIds=new Set(Array.from(clean.querySelectorAll('[id]'),node=>node.id));
        if (clean.id) knownIds.add(clean.id);
        const scanned=new Set(),pending=[clean,...clean.querySelectorAll('*')];
        let importedDefs=null,referenceCount=0;
        while (pending.length) {
          const node=pending.shift();
          if (scanned.has(node)) continue;
          scanned.add(node);
          for (const attr of Array.from(node.attributes)) {
            const ref=attr.name==='href' ? attr.value.slice(1) : attr.value.match(/^url\(\s*#([A-Za-z_][\w.:-]*)\s*\)$/i)?.[1];
            if (!ref || knownIds.has(ref)) continue;
            if (++referenceCount>256) throw Error('SVG references too complex');
            const original=document.getElementById(ref);
            const imported=original && original.namespaceURI===ns ? clone(original,0,true) : null;
            if (!imported) {node.removeAttribute(attr.name);continue;}
            if (!importedDefs) {
              importedDefs=document.createElementNS(ns,'defs');
              clean.insertBefore(importedDefs,clean.firstChild);
            }
            // A document-wide fragment may be repeated; each definition is copied once.
            knownIds.add(ref);
            if (imported.id) knownIds.add(imported.id);
            for (const child of imported.querySelectorAll('[id]')) knownIds.add(child.id);
            importedDefs.appendChild(imported);
            pending.push(imported,...imported.querySelectorAll('*'));
          }
        }
        clean.setAttribute('xmlns',ns);
        const bytes=new TextEncoder().encode(new XMLSerializer().serializeToString(clean));
        if (bytes.length>128*1024) return '';
        let binary='';
        for (let i=0;i<bytes.length;i+=8192) binary+=String.fromCharCode(...bytes.subarray(i,i+8192));
        return 'data:image/svg+xml;base64,'+btoa(binary);
      } catch { return ''; }
    }
    function contentImage(element) {
      if (element.closest('nav,header,footer,aside,[role="navigation"]')) return false;
      const marker=[element.id,element.getAttribute('class'),element.getAttribute('alt'),element.getAttribute('src'),element.parentElement?.getAttribute('class')].join(' ');
      return !/(?:^|[\s/_.-])(?:avatar|avatars|icon|icons|logo|logos|badge|badges|emoji|emojis|tracking|spacer)(?:$|[\s/_.-])/i.test(marker);
    }
    function collectImages(scope,contentOnly) {
      for (const img of scope.querySelectorAll('img,svg,a[href]')) {
        if (images.length>=100) break;
        if (!visible(img) || contentOnly && !contentImage(img)) continue;
        if (img.localName==='a') {
          const url=publicUrl(img.href);
          if (url && imageFormat(url)) addImage(url,0,0,imageFormat(url));
          continue;
        }
        const rect=img.getBoundingClientRect();
        if (rect.width<8 || rect.height<8) continue;
        if (img.localName==='svg') {
          if (img.parentElement?.closest('svg')) continue;
          const viewBox=img.viewBox?.baseVal;
          addImage(passiveSvg(img),Math.round(viewBox?.width || rect.width),Math.round(viewBox?.height || rect.height),'svg');
          continue;
        }
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
        if (!url || !placeholder && (width<8 || height<8)) continue;
        addImage(url,placeholder ? Number(img.getAttribute('width'))||Math.round(rect.width) : width,placeholder ? Number(img.getAttribute('height'))||Math.round(rect.height) : height,imageFormat(url));
      }
    }
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
      if(mediaKind!=='video')collectImages(scope,true);
      if(mediaKind==='gallery')continue;
      for (const video of scope.querySelectorAll('video')) {
        if (!visible(video)) continue;
        addVideo(video.currentSrc || video.getAttribute('src'),video.getAttribute('type'),video.title);
        for (const item of video.querySelectorAll('source[src]')) addVideo(item.getAttribute('src'),item.type,video.title);
      }
      for (const link of scope.querySelectorAll('a[href]')) {
        if (visible(link)) addVideo(link.href,'video',link.textContent);
      }
    }
    // Keep main content first, then include visible logos, avatars and page icons.
    if (document.body&&mediaKind!=='video') collectImages(document.body,false);
    const result={url:location.href,title:document.title,images,videos};
    if (location.hostname==='huggingface.co' && /^\/[^/]+\/[^/]+\/?$/.test(location.pathname) && !images.length && !videos.length) result.modelRepoUrl=location.origin+location.pathname;
    return result;
  }

  async function collectPageMedia(windowId, expectedUrl, mediaKind='all') {
    const changed='当前标签页已变化。请切回要获取媒体的页面，再点击获取。';
    const normalized=value=>{try {const url=new URL(value);url.hash='';return url.href;}catch{return '';}};
    if (!Number.isInteger(windowId) || windowId<0) return {ok:false,error:'无法确定当前浏览器窗口，请重新打开侧栏后重试。'};
    if (!isPublicPageMediaUrl(expectedUrl)) return {ok:false,error:'仅支持公开的 HTTP/HTTPS 网页，请打开目标网页后重试。'};
    const expected=normalized(expectedUrl);
    try {
      const tabs=await chrome.tabs.query({active:true,windowId});
      const tab=tabs.find(item=>item.windowId===windowId);
      if (!tab || !Number.isInteger(tab.id) || normalized(tab.url)!==expected || tab.pendingUrl && normalized(tab.pendingUrl)!==expected) return {ok:false,error:changed};
      const results=await chrome.scripting.executeScript({target:{tabId:tab.id,frameIds:[0]},func:collectDocumentMedia,args:[['video','gallery'].includes(mediaKind)?mediaKind:'all']});
      const captured=results.find(item=>item.frameId===0)?.result;
      const current=await chrome.tabs.get(tab.id);
      if (!captured || normalized(captured.url)!==expected || normalized(current.url)!==expected || current.windowId!==windowId || current.active===false || current.pendingUrl && normalized(current.pendingUrl)!==expected) return {ok:false,error:changed};
      let svgDataLength=0;
      const images=(Array.isArray(captured.images)?captured.images:[]).filter(item=>{
        if (isPublicPageMediaUrl(item?.url)) return true;
        if (item?.format!=='svg' || typeof item.url!=='string' || !/^data:image\/svg\+xml;base64,(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(item.url)) return false;
        const data=item.url.slice(26),bytes=data.length/4*3-(data.endsWith('==')?2:data.endsWith('=')?1:0);
        if (!bytes || bytes>128*1024 || svgDataLength+item.url.length>512*1024) return false;
        svgDataLength+=item.url.length;
        return true;
      }).slice(0,100).map(item=>({url:item.url,width:Number(item.width)||0,height:Number(item.height)||0,format:String(item.format||'')}));
      const videos=(Array.isArray(captured.videos)?captured.videos:[]).filter(item=>isPublicPageMediaUrl(item?.url)).slice(0,30);
      return {ok:true,url:captured.url,title:String(captured.title||'').slice(0,500),images,videos,...(captured.modelRepoUrl===expected?{modelRepoUrl:captured.modelRepoUrl}:{})};
    } catch (error) {
      if (/permission|cannot access|not allowed|missing host|cannot be scripted/i.test(String(error?.message||error))) return {ok:false,error:'需要此网站的访问权限。请允许访问后，再点击“获取视频”或“获取图集”。'};
      return {ok:false,error:'无法读取当前网页。请确认页面已加载，刷新后重试。'};
    }
  }

  root.collectPageMedia=collectPageMedia;
  if (typeof module!=='undefined' && module.exports) module.exports={collectPageMedia,collectDocumentMedia,isPublicPageMediaUrl};
})(globalThis);
