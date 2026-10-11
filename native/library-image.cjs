'use strict';
const fs=require('node:fs');
module.exports=function readImage(message,item,fileInfo){
 const file=item.files.find(f=>f.name===message.name);
 if(!file||file.unsafe)throw Error('图片不在这份资料内');
 const info=fileInfo(file.path,item.directory);
 if(!info.exists)throw Error('图片已移动或删除');
 if(info.size>32*1024*1024)throw Error('图片超过 32 MB，请打开下载目录查看');
 const revision=`${info.size}:${info.mtimeMs}:${info.ino}`;
 if(message.revision&&message.revision!==revision)throw Error('图片已变化，请重新打开详情');
 const offset=message.offset??0;
 if(!Number.isSafeInteger(offset)||offset<0||offset>=info.size)throw Error('图片读取位置无效');
 const fd=fs.openSync(info.path,'r');try{
  const head=Buffer.alloc(12);fs.readSync(fd,head,0,12,0);
  const mime=head.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))?'image/png':head[0]===255&&head[1]===216&&head[2]===255?'image/jpeg':/^GIF8[79]a/.test(head.toString('ascii'))?'image/gif':head.toString('ascii',0,4)==='RIFF'&&head.toString('ascii',8,12)==='WEBP'?'image/webp':null;
  if(!mime)throw Error('暂不支持这种图片格式，请打开下载目录查看');
  const chunk=Buffer.alloc(Math.min(192*1024,info.size-offset)),length=fs.readSync(fd,chunk,0,chunk.length,offset);
  if(!length)throw Error('图片读取失败');
  return {ok:true,mime,revision,total:info.size,nextOffset:offset+length,data:chunk.subarray(0,length).toString('base64')};
 }finally{fs.closeSync(fd);}
};
