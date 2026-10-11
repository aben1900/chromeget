(() => {
 const ns='http://www.w3.org/2000/svg';
 function decorate(button){
  const label=button.textContent.trim();if(label==='确认删除')return;
  if(!/^(?:停止并删除|确认删除|删除(?:选中|所选|配置|此模型|这份资料)?(?:[（(]\d+[）)])?|移除)$/.test(label))return;
  button.setAttribute('aria-label',label);if(!button.title||button.dataset.deleteIcon)button.title=label;
  button.dataset.deleteIcon='true';button.classList.add('delete-icon');
  const svg=document.createElementNS(ns,'svg');svg.setAttribute('viewBox','0 0 24 24');svg.setAttribute('aria-hidden','true');svg.setAttribute('fill','none');svg.setAttribute('stroke','currentColor');svg.setAttribute('stroke-width','1.7');svg.setAttribute('stroke-linecap','round');svg.setAttribute('stroke-linejoin','round');const path=document.createElementNS(ns,'path');path.setAttribute('d','M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7');svg.append(path);button.replaceChildren(svg);
 }
 function scan(root){if(root.nodeType!==1)return;if(root.matches('button'))decorate(root);root.querySelectorAll('button').forEach(decorate);}
 scan(document.body);
 new MutationObserver(records=>{const roots=new Set();for(const r of records){const target=r.target.nodeType===1?r.target:r.target.parentElement;const button=target?.closest('button');if(button)roots.add(button);for(const n of r.addedNodes)if(n.nodeType===1)roots.add(n);}roots.forEach(scan);}).observe(document.body,{childList:true,subtree:true,characterData:true});
 const operation=document.getElementById('taxonomyOperation');if(operation){const apply=document.querySelector('#taxonomyForm button');operation.addEventListener('change',()=>{apply.classList.remove('delete-icon');delete apply.dataset.deleteIcon;apply.removeAttribute('aria-label');apply.removeAttribute('title');apply.textContent=operation.value==='delete'?'删除':'应用';decorate(apply);});}
})();
