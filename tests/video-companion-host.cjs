const fs=require('node:fs'),assert=require('node:assert/strict');
const host=fs.readFileSync('native/host.ps1','utf8');
assert.ok(/video-companion-capture[^\r\n]*\)\s*\{\s*throw '单条记录不能超过 1 MB/.test(host),'screenshot must use the dedicated Native message allowance');
assert.ok(host.includes('video-companion-v1'),'host must advertise companion support');
console.log('PASS companion screenshot Native message allowance and capability');
