(() => {
 async function split(png,limit=1800,overlap=80) {
  const image=new Image();image.src=png;await image.decode();
  if(image.naturalWidth<=limit&&image.naturalHeight<=limit)return [png];
  const tiles=[];
  for(let y=0;y<image.naturalHeight;y+=limit-overlap){
   for(let x=0;x<image.naturalWidth;x+=limit-overlap){
    const width=Math.min(limit,image.naturalWidth-x),height=Math.min(limit,image.naturalHeight-y);
    if(width<1||height<1)continue;
    const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;canvas.getContext('2d').drawImage(image,x,y,width,height,0,0,width,height);
    const tile=canvas.toDataURL('image/png');if((tile.length-22)*3/4>8*1024*1024)throw Error('识别分段超过 8 MB，请缩小截图范围。');tiles.push(tile);
    if(tiles.length>40)throw Error('长截图需要识别的分段过多，请缩小范围。');
   }
  }
  return tiles;
 }
 function merge(previous,next){const a=String(previous||'').trimEnd(),b=String(next||'').trimStart();if(!a)return b;if(!b)return a;const left=a.split('\n'),right=b.split('\n');let overlap=0;for(let count=Math.min(8,left.length,right.length);count>0;count--)if(left.slice(-count).map(line=>line.trim()).join('\n')===right.slice(0,count).map(line=>line.trim()).join('\n')){overlap=count;break}return a+'\n'+right.slice(overlap).join('\n')}
 window.OcrTiles={split,merge};
})();
