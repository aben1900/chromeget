async function downloadPageLinks(windowId){
  if(!Number.isInteger(windowId))throw Error('无法确定当前窗口。');
  const [tab]=await chrome.tabs.query({active:true,windowId});
  if(!tab||!webpageUrl(tab.url))throw Error('请打开普通网页后重试。');
  const result=await chrome.scripting.executeScript({target:{tabId:tab.id},func:()=>{
    const seen=new Set(),links=[];
    const fileSuffix=/\.(pdf|doc|docx|txt|md|rtf|epub|xls|xlsx|csv|tsv|ppt|pptx|zip|rar|7z|gz|tar|bz2|xz|exe|msi|msix|dmg|pkg|apk|iso|bin|jpg|jpeg|png|gif|webp|svg|avif|heic|mp3|m4a|wav|flac|aac|ogg|mp4|mkv|webm|mov|avi|m3u8|mpd|gguf|safetensors|onnx|pt|pth|json)$/i;
    const isFileName=value=>{try{return fileSuffix.test(decodeURIComponent(value))}catch{return fileSuffix.test(value)}};
    for(const a of document.querySelectorAll('a[href],video[src],audio[src],source[src]')){
      try{
        const u=new URL(a.href||a.src,location.href);if(!['http:','https:'].includes(u.protocol)||u.username||u.password||seen.has(u.href))continue;
        const filename=a.getAttribute('download')||'';
        const queryFilename=['filename','file','name','download'].map(key=>u.searchParams.get(key)||'').find(isFileName)||'';
        const download=a.hasAttribute('download')||isFileName(u.pathname)||isFileName(queryFilename)||(u.hostname==='huggingface.co'&&/^\/[^/]+\/[^/]+\/resolve\/.+/.test(u.pathname));
        if(!download)continue;
        seen.add(u.href);
        links.push({url:u.href,text:(a.textContent||a.getAttribute('title')||'').trim().slice(0,150),filename:filename||queryFilename,download});
        if(links.length>=3000)break;
      }catch{}
    }
    return links.sort((a,b)=>Number(b.download)-Number(a.download)).slice(0,300);
  }});
  return {ok:true,links:result[0]?.result||[]};
}
