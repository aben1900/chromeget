(function(root){
  function urlOf(text){try{const u=new URL(/^www\./i.test(text)?'https://'+text:text);return ['http:','https:'].includes(u.protocol)&&!u.username&&!u.password&&!/\s/.test(text)?u.href:'';}catch{return '';}}
  function classify(value){const text=String(value||'').trim();if(!text)return {kind:'empty',text};const url=urlOf(text);if(url)return {kind:'url',text,url};const lines=text.split(/\r?\n/).map(s=>s.trim()).filter(Boolean);return {kind:lines.length>1&&lines.every(urlOf)?'multi':'text',text};}
  const api={classify};root.Collect=api;if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(globalThis);
