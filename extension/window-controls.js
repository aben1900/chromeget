(() => {
 const svg=path=>`<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${path}"/></svg>`;
 function maximize(dialog,bar){
  const button=document.createElement('button');button.type='button';button.className='detail-icon window-maximize';
  function update(){const expanded=dialog.classList.contains('window-expanded');button.title=expanded?'恢复窗口':'最大化';button.setAttribute('aria-label',button.title);button.setAttribute('aria-pressed',String(expanded));button.innerHTML=svg(expanded?'M8 8h13v13H8zM3 16V3h13':'M3 3h18v18H3z');}
  button.addEventListener('click',()=>{dialog.classList.toggle('window-expanded');update();});bar.insertBefore(button,bar.lastElementChild);update();
  dialog.addEventListener('close',()=>{dialog.classList.remove('window-expanded');update();});
 }
 window.WindowControls={maximize,closeIcon:svg('M6 6l12 12M18 6L6 18')};
 const detail=document.getElementById('detail');if(detail)maximize(detail,detail.querySelector('.detail-actions'));
})();
