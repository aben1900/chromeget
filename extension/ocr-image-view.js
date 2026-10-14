(() => {
 const image=document.getElementById('ocrImage'),container=document.querySelector('.review-image');if(!image||!container)return;
 const stage=document.createElement('div');stage.className='image-stage';stage.tabIndex=0;stage.setAttribute('aria-label','截图预览，可滚轮缩放或拖动');image.replaceWith(stage);stage.append(image);image.draggable=false;
 const toolbar=document.createElement('div');toolbar.className='image-view-tools';const value=document.createElement('span');value.setAttribute('aria-live','polite');
 function button(label,path,handler){const b=document.createElement('button');b.type='button';b.title=label;b.setAttribute('aria-label',label);b.innerHTML='<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true"><path d="'+path+'"/></svg>';b.onclick=handler;toolbar.append(b);return b}
 let zoom=1,fit=1,x=0,y=0,start=null,lastSource='';
 function render(){image.style.width=image.naturalWidth+'px';image.style.height=image.naturalHeight+'px';image.style.transform='translate(-50%,-50%) translate('+x+'px,'+y+'px) scale('+(fit*zoom)+')';value.textContent=Math.round(fit*zoom*100)+'%';container.dataset.zoom=String(zoom);}
 function reset(){zoom=1;x=y=0;fit=Math.min((stage.clientWidth-24)/Math.max(1,image.naturalWidth),(stage.clientHeight-24)/Math.max(1,image.naturalHeight),1);fit=Math.max(.001,fit);render()}
 function scale(factor,point=null){const before=zoom;zoom=Math.max(.25,Math.min(12,zoom*factor));const ratio=zoom/before;if(point){const rect=stage.getBoundingClientRect(),px=point.x-rect.x-rect.width/2,py=point.y-rect.y-rect.height/2;x=px-(px-x)*ratio;y=py-(py-y)*ratio;}render()}
 button('缩小截图','M5 12h14',()=>scale(1/1.2));toolbar.append(value);button('放大截图','M5 12h14M12 5v14',()=>scale(1.2));button('适应窗口','M8 4H4v4m12-4h4v4M4 16v4h4m12-4v4h-4',reset);container.append(toolbar);
 image.addEventListener('load',()=>{if(lastSource!==image.src){lastSource=image.src;reset()}else render()});new ResizeObserver(reset).observe(stage);if(image.complete&&image.naturalWidth)reset();
 stage.addEventListener('wheel',e=>{e.preventDefault();scale(e.deltaY<0?1.15:1/1.15,{x:e.clientX,y:e.clientY})},{passive:false});
 stage.onpointerdown=e=>{if(e.button!==0)return;e.preventDefault();start={px:e.clientX,py:e.clientY,x,y};stage.setPointerCapture(e.pointerId);stage.classList.add('dragging')};
 stage.onpointermove=e=>{if(!start)return;x=start.x+e.clientX-start.px;y=start.y+e.clientY-start.py;render()};function end(){start=null;stage.classList.remove('dragging')}stage.onpointerup=end;stage.onpointercancel=end;
 stage.onkeydown=e=>{if(['+','=','-','0'].includes(e.key)){e.preventDefault();if(e.key==='0')reset();else scale(e.key==='-'?1/1.2:1.2)}};
})();
