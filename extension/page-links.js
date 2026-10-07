async function downloadPageLinks(windowId){
  if(!Number.isInteger(windowId))throw Error('无法确定当前窗口。');
  const [tab]=await chrome.tabs.query({active:true,windowId});
  if(!tab||!webpageUrl(tab.url))throw Error('请打开普通网页后重试。');
  const result=await chrome.scripting.executeScript({target:{tabId:tab.id},func:()=>{
    const seen=new Set(),links=[];
    for(const a of document.querySelectorAll('a[href],video[src],audio[src],source[src]')){
      try{
        const u=new URL(a.href||a.src,location.href);if(!['http:','https:'].includes(u.protocol)||u.username||u.password||seen.has(u.href))continue;
        seen.add(u.href);const filename=a.getAttribute('download')||'';
        const download=!!filename||a.hasAttribute('download')||a.tagName!=='A'||/\.(zip|7z|rar|tar|gz|exe|msi|pdf|iso|bin|safetensors|gguf|pt|pth|onnx|json|mp4|mp3|webm)(?:$|\?)/i.test(u.href)||u.hostname==='huggingface.co';
        links.push({url:u.href,text:(a.textContent||a.getAttribute('title')||'').trim().slice(0,150),filename,download});
        if(links.length>=3000)break;
      }catch{}
    }
    return links.sort((a,b)=>Number(b.download)-Number(a.download)).slice(0,300);
  }});
  return {ok:true,links:result[0]?.result||[]};
}
