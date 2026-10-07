const http=require('node:http'),fs=require('node:fs'),path=require('node:path');
const {build,revision,root}=require('./build-showcase.cjs');
let current=build().revision;
const server=http.createServer((req,res)=>{
  try{
    const next=revision();if(next!==current)current=build().revision;
    const url=new URL(req.url,'http://127.0.0.1');
    if(url.pathname==='/__showcase_revision'){res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify({revision:current}));return;}
    const requested=decodeURIComponent(url.pathname);
    const file=requested==='/'||requested==='/功能介绍.html'?'功能介绍.html':requested==='/精彩摘录-Chrome插件-Windows.zip'?'精彩摘录-Chrome插件-Windows.zip':null;
    if(!file){res.writeHead(404);res.end('Not found');return;}
    res.writeHead(200,{'Content-Type':file.endsWith('.zip')?'application/zip':'text/html; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});
    const stream=fs.createReadStream(path.join(root,file));stream.on('error',()=>res.destroy());stream.pipe(res);
  }catch(e){console.error(e.message);res.writeHead(500);res.end('Preview build failed');}
});
const timer=setInterval(()=>{try{const next=revision();if(next!==current)current=build().revision;}catch(e){console.error(e.message);}},1500);timer.unref();
const port=Number(process.env.SHOWCASE_PORT)||18763;
function open(){if(process.argv.includes('--open'))require('node:child_process').spawn('explorer.exe',['http://127.0.0.1:'+port+'/'],{windowsHide:true,stdio:'ignore'}).unref();}
server.on('error',e=>{if(e.code==='EADDRINUSE'){console.log('该端口已在使用，打开现有预览。');open();}else console.error(e);});
server.listen(port,'127.0.0.1',()=>{console.log('功能介绍实时预览：http://127.0.0.1:'+port);open();});
