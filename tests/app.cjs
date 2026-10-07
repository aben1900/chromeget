const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const nodes={};let loads=0,src='';
const frame={getAttribute:()=>src,set src(value){src=value;loads++;}};
function node(id){return nodes[id] ||= {hidden:false,setAttribute(){},addEventListener(){}};}
const context=vm.createContext({document:{getElementById:node,querySelector:()=>frame},chrome:{windows:{getCurrent:async()=>({id:1})},storage:{onChanged:{addListener(){}},session:{get:async()=>({}),set:async()=>{}}}},currentBiliVideo:async()=>''});
(async()=>{
 vm.runInContext(fs.readFileSync(path.join(__dirname,'../extension/app.js'),'utf8'),context);
 await new Promise(r=>setImmediate(r));assert.equal(node('clips').hidden,false);assert.equal(loads,0);
 context.selectView('video');assert.equal(src,'video.html');assert.equal(node('clips').hidden,true);
 context.selectView('clips');context.selectView('video');assert.equal(loads,1,'switching must retain video state');
 const manifest=JSON.parse(fs.readFileSync(path.join(__dirname,'../extension/manifest.json')));
 assert.equal(manifest.side_panel.default_path,'app.html');assert.equal(manifest.action.default_popup,undefined);
 console.log('PASS single side-panel entry, lazy video, state retained across tab switching');
})().catch(error=>{console.error(error);process.exitCode=1;});
