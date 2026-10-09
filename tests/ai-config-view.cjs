'use strict';
const assert=require('assert/strict'),{buildConfigView}=require('../extension/library-ai-view.js');
const p={profileId:'a',label:'公司网关',tags:['SMEC','常用'],model:'flash',models:[{id:'flash',label:'Flash'},{id:'pro',label:'Pro'}],hasKey:true,revision:'r'};
const v=buildConfigView({a:p},'a',{query:'pro',tag:'',status:'',sort:'name-asc',defaultFirst:true});
assert.equal(v.groups.length,2);assert.equal(v.uniqueCount,1);assert.equal(v.groups[0].rows[0].matchOtherModel,true);assert.equal(p.model,'flash');
assert.equal(buildConfigView({a:p},'a',{query:'absent'}).uniqueCount,0);
assert.equal(buildConfigView({a:{...p,tags:[]}},'a',{}).groups[0].tag,'');
console.log('PASS config tag groups, unique counts and non-current model search without selection mutation');
