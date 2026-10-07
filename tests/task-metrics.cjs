const fs=require('fs'),vm=require('vm'),assert=require('assert/strict');
const c=vm.createContext({Date});vm.runInContext(fs.readFileSync('extension/task-ui.js','utf8'),c);
let m=c.taskMetrics({state:'running',progress:'[#abcdef 683MiB/1.4GiB(45%) CN:16 DL:1.1MiB ETA:12m21s]'});assert.equal(m.connections,16);assert.equal(m.completed,683*1024**2);assert.ok(m.percent>47&&m.percent<48);assert.equal(c.logBytes('1B'),1);
m=c.taskMetrics({state:'running',progress:'[download]  25.0% of 100.00MiB at 5.00MiB/s ETA 00:15'});assert.equal(m.percent,25);assert.equal(m.speed,5*1024**2);assert.equal(m.eta,15);
m=c.taskMetrics({state:'paused',metrics:{total:100,completed:25,speed:50}});assert.equal(m.speed,0);assert.equal(m.percent,25);
m=c.taskMetrics({state:'completed',metrics:{total:100,completed:95,speed:50}});assert.equal(m.percent,100);assert.equal(m.completed,100);assert.equal(m.speed,0);
m=c.taskMetrics({state:'running',progress:''});assert.equal(m.percent,null);assert.equal(c.formatEta(null),'—');console.log('PASS RPC/log metrics, video rate/ETA, unknown progress, paused/completed values');
