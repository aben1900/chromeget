(()=>{
  if(globalThis.__jingcaiVideoHover)return;globalThis.__jingcaiVideoHover=true;
  let enabled=false,video=null,hideTimer;
  const host=document.createElement('div');host.id='jingcai-video-download';host.style.cssText='position:fixed;z-index:2147483647;display:none';
  const shadow=host.attachShadow({mode:'closed'}),style=document.createElement('style');
  style.textContent='button{font:13px/1.4 system-ui,sans-serif;color:white;background:#242424;border:1px solid #686868;border-radius:9px;box-shadow:0 4px 20px #0004;padding:9px 13px;cursor:pointer}button:focus-visible{outline:2px solid white}span{display:block;max-width:240px;color:white;background:#383838;font:12px/1.5 system-ui;padding:8px;border-radius:6px;margin-top:5px}span:empty{display:none}';
  const button=document.createElement('button');button.textContent='↓ 下载此视频';const status=document.createElement('span');status.setAttribute('role','status');shadow.append(style,button,status);document.documentElement.append(host);
  function hide(){host.style.display='none';video=null;status.textContent='';}
  function position(){if(!video?.isConnected){hide();return;}const r=video.getBoundingClientRect();if(r.width<120||r.height<70||r.bottom<0||r.top>innerHeight){hide();return;}host.style.top=Math.max(8,r.top+12)+'px';host.style.left=Math.max(8,Math.min(innerWidth-150,r.right-150))+'px';}
  chrome.storage.local.get('hoverDownloadEnabled').then(data=>enabled=!!data.hoverDownloadEnabled);
  chrome.storage.onChanged.addListener((changes,area)=>{if(area==='local'&&changes.hoverDownloadEnabled){enabled=!!changes.hoverDownloadEnabled.newValue;if(!enabled)hide();}});
  document.addEventListener('pointerover',event=>{
    if(!enabled)return;
    const candidate=event.composedPath().find(n=>n instanceof HTMLVideoElement)||[...document.querySelectorAll('video')].find(v=>{const r=v.getBoundingClientRect();return r.width>=120&&r.height>=70&&event.clientX>=r.left&&event.clientX<=r.right&&event.clientY>=r.top&&event.clientY<=r.bottom;});
    if(candidate){clearTimeout(hideTimer);video=candidate;host.style.display='block';status.textContent='';position();}
  },true);
  document.addEventListener('pointerout',event=>{if(event.target===video)hideTimer=setTimeout(hide,1600);},true);
  host.addEventListener('pointerenter',()=>clearTimeout(hideTimer));host.addEventListener('pointerleave',()=>hideTimer=setTimeout(hide,800));
  document.addEventListener('pointermove',event=>{if(!video||host.contains(event.target))return;const r=video.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom){if(!hideTimer)hideTimer=setTimeout(()=>{hideTimer=null;hide();},800);}else{clearTimeout(hideTimer);hideTimer=null;}},{passive:true});
  window.addEventListener('scroll',()=>{if(video)position();},{passive:true});window.addEventListener('resize',()=>{if(video)position();},{passive:true});
  function videoPage(target){
    if(!target?.isConnected)return '';
    const domain=location.hostname;
    if(/(^|\.)(x|twitter)\.com$/.test(domain)){
      const post=target.closest('article');
      if(post){
        const links=[...post.querySelectorAll('a[href]')];
        const link=links.find(a=>a.querySelector('time')&&/\/status\/\d+/.test(a.pathname))||links.find(a=>/\/status\/\d+/.test(a.pathname));
        if(link){const match=link.pathname.match(/\/status\/(\d+)/);const videos=[...post.querySelectorAll('video')];return 'https://x.com/i/web/status/'+match[1]+(videos.length>1?'/video/'+(videos.indexOf(target)+1):'');}
      }
      if(!/\/status\/\d+/.test(location.pathname))return '';
    }
    if(/(^|\.)reddit\.com$/.test(domain)){
      const post=target.closest('shreddit-post,article,[data-testid="post-container"]');
      const permalink=post?.getAttribute('permalink')||post?.querySelector('a[href*="/comments/"]')?.href;
      if(permalink)return new URL(permalink,location.href).href;
    }
    return location.href;
  }
  let lastPage=location.href;
  window.addEventListener('popstate',hide);window.addEventListener('hashchange',hide);
  document.addEventListener('pointerover',()=>{if(lastPage!==location.href){lastPage=location.href;status.textContent='';if(video&&!video.isConnected)hide();}},{passive:true});
  button.addEventListener('click',async event=>{
    event.preventDefault();event.stopPropagation();button.disabled=true;clearTimeout(hideTimer);
    try{if(!video?.isConnected)throw Error('视频已切换，请重新移到目标视频上。');const pageUrl=videoPage(video);if(!pageUrl)throw Error('未找到当前视频的帖子链接，请打开该帖子后重试。');const result=await chrome.runtime.sendMessage({action:'page-video-download',pageUrl,mediaUrl:video?.currentSrc||video?.src||''});if(!result?.ok)throw Error(result?.error||'无法打开下载面板');status.textContent='已载入右侧面板，请选择画质或确认下载。';}
    catch(e){status.textContent=e.message;}finally{button.disabled=false;}
  });
})();
