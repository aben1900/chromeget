(function(root){
 const variables=text=>[...new Set([...String(text).matchAll(/\{\{([^{}\r\n]{1,60})\}\}/g)].map(m=>m[1]))];
 function fill(text,values){const missing=variables(text).filter(k=>typeof values[k]!=='string'||!values[k].trim());if(missing.length)throw Error('请填写：'+missing.join('、'));return String(text).replace(/\{\{([^{}\r\n]{1,60})\}\}/g,(_,k)=>values[k]);}
 const api={variables,fill};root.LibraryModel=api;if(typeof module!=='undefined')module.exports=api;
})(globalThis);
