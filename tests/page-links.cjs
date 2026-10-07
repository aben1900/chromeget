const fs=require('fs'),vm=require('vm'),assert=require('assert/strict');
const anchor=(href,text='',attrs={})=>({href,tagName:'A',textContent:text,getAttribute:k=>attrs[k]??null,hasAttribute:k=>k in attrs});
const nodes=[anchor('https://example.com/help','help'),anchor('https://example.com/model.gguf','model'),anchor('https://example.com/model.gguf','duplicate'),anchor('javascript:alert(1)','bad'),anchor('https://huggingface.co/org/model','repo')];
const context=vm.createContext({URL,document:{querySelectorAll:()=>nodes},location:{href:'https://example.com/'},webpageUrl:u=>u,chrome:{tabs:{query:async()=>[{id:1,url:'https://example.com'}]},scripting:{executeScript:async({func})=>[{result:func()}]}}});
vm.runInContext(fs.readFileSync('extension/page-links.js','utf8'),context);
(async()=>{const r=await context.downloadPageLinks(1);assert.equal(r.links.length,3);assert.equal(r.links[0].url,'https://example.com/model.gguf');assert.equal(r.links[1].download,true);await assert.rejects(()=>context.downloadPageLinks('1'));console.log('PASS page link extraction, file priority, duplicate and non-HTTP rejection, window validation');})().catch(e=>{console.error(e);process.exitCode=1;});
