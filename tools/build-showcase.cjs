const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..');
const inputs=['extension/manifest.json','native/host.ps1','使用说明.md','showcase/features.json','showcase/template.html'];
const read=p=>fs.readFileSync(path.join(root,p),'utf8').replace(/^\uFEFF/,'');
function revision(){return crypto.createHash('sha256').update(inputs.map(p=>read(p)).join('\0')).digest('hex').slice(0,16);}
function build(){
  const catalog=JSON.parse(read('showcase/features.json')),manifest=JSON.parse(read('extension/manifest.json'));
  const nativeVersion=read('native/host.ps1').match(/version='([\d.]+)'/)?.[1]||'未知';
  const changes=[];
  for(const section of read('使用说明.md').split(/^## /m).slice(1)){
    const [title,...body]=section.split(/\r?\n/),version=title.match(/\d+\.\d+\.\d+/)?.[0];if(!version)continue;
    const summary=body.filter(l=>l.trim()&&!l.startsWith('|')).slice(0,2).join(' ').replace(/https?:\/\/\S+/g,'').replace(/[*`]/g,'').slice(0,500);
    changes.push({version,title:title.replace(/（.*?）/g,'').trim(),summary});
  }
  changes.sort((a,b)=>{const x=a.version.split('.').map(Number),y=b.version.split('.').map(Number);return y[0]-x[0]||y[1]-x[1]||y[2]-x[2];});
  const stamp=new Date(Math.max(...inputs.map(p=>fs.statSync(path.join(root,p)).mtimeMs))).toISOString();
  const data={...catalog,version:manifest.version,nativeVersion,updatedAt:stamp,changes:changes.slice(0,10),revision:revision()};
  const template=read('showcase/template.html');if(!template.includes('__SHOWCASE_DATA__'))throw Error('Missing data placeholder');
  const html=template.replace('__SHOWCASE_DATA__',JSON.stringify(data).replace(/</g,'\\u003c'));
  const output=path.join(root,'功能介绍.html');
  if(!fs.existsSync(output)||fs.readFileSync(output,'utf8')!==html){const temp=output+'.tmp';fs.writeFileSync(temp,html);fs.renameSync(temp,output);}
  // Extension pages require external executable scripts under the default CSP.
  let bundledScript='';const bundled=html.replace(/<script>([\s\S]*?)<\/script>/g,(_,script)=>{bundledScript+=script+'\n';return '<script src="showcase-page.js"></script>';});
  for(const [name,content] of [['功能介绍.html',bundled],['showcase-page.js',bundledScript]]){const target=path.join(root,'extension',name);if(!fs.existsSync(target)||fs.readFileSync(target,'utf8')!==content)fs.writeFileSync(target,content);}
  return data;
}
if(require.main===module){const data=build();console.log('功能介绍.html 已同步 · 扩展 '+data.version+' / 本地程序 '+data.nativeVersion);}
module.exports={build,revision,inputs,root};
