'use strict';
const fs=require('fs'),path=require('path'),assert=require('assert/strict'),{spawnSync}=require('child_process'),{DatabaseSync}=require('node:sqlite');
const root=path.resolve('work/ai-config-'+Date.now());fs.mkdirSync(root,{recursive:true});const dbPath=path.join(root,'cc-switch.db');
const db=new DatabaseSync(dbPath);db.exec('CREATE TABLE providers (id TEXT, app_type TEXT, name TEXT, settings_config TEXT)');
const config=JSON.stringify({env:{ANTHROPIC_BASE_URL:'https://example.test',ANTHROPIC_AUTH_TOKEN:'sk-fixture-only',ANTHROPIC_MODEL:'glm-5.2',ANTHROPIC_DEFAULT_SONNET_MODEL:'qwen3.7-max'}});
db.prepare('INSERT INTO providers VALUES (?,?,?,?)').run('fixture','claude','yqn Claude',config);db.prepare('INSERT INTO providers VALUES (?,?,?,?)').run('other','codex','yqn Claude',config);db.close();
const before=fs.readFileSync(dbPath),cc=require('../native/ai-ccswitch.cjs');const list=cc.listClaudeProviders(dbPath);assert.equal(list.length,1);assert.equal(list[0].model,'glm-5.2');assert.deepEqual(list[0].models.map(v=>v.id),['glm-5.2','qwen3.7-max']);assert.ok(!JSON.stringify(list).includes('sk-fixture-only'));assert.equal(cc.resolveClaudeProvider(dbPath,'fixture','qwen3.7-max').auth,'bearer');assert.throws(()=>cc.resolveClaudeProvider(dbPath,'other'));assert.deepEqual(fs.readFileSync(dbPath),before);
for(const name of ['ai-config.ps1','ai-provider.cjs','ai-ccswitch.cjs','ai-runner.cjs','ai-transport.cjs'])fs.copyFileSync('native/'+name,path.join(root,name));
const script=`$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot 'ai-config.ps1')
$first=Get-AiPublicSettings $PSScriptRoot
if($first.profiles.openai.model -ne 'gpt-4.1-mini' -or $first.profiles.deepseek.model -ne 'deepseek-flash'){throw 'defaults'}
$saved=Save-AiSettings $PSScriptRoot @{profileId='openai';key='sk-fixture-only'}
if(-not $saved.profiles.openai.hasKey){throw 'save'}
if((Get-Content (Join-Path $PSScriptRoot 'ai-settings.json') -Raw).Contains('sk-fixture-only')){throw 'plaintext'}
$resolved=Resolve-AiProfile $PSScriptRoot 'openai' ''
if($resolved.secret -ne 'sk-fixture-only'){throw 'decrypt'}
$retained=Save-AiSettings $PSScriptRoot @{profileId='openai';model='custom-model'}
if(-not $retained.profiles.openai.hasKey){throw 'retain'}
$cleared=Save-AiSettings $PSScriptRoot @{profileId='openai';baseUrl='https://other.test/v1'}
if($cleared.profiles.openai.hasKey){throw 'address leak'}
try {Save-AiSettings $PSScriptRoot @{profileId='openai';key='sk-placeholder-replace-me'};throw 'placeholder accepted'}catch{if($_.Exception.Message -ne 'KEY_NOT_CONFIGURED'){throw}}
Write-Output 'PASS DPAPI encrypted settings, defaults, model retain and endpoint clear'
`;
fs.writeFileSync(path.join(root,'test.ps1'),'\ufeff'+script);const r=spawnSync('powershell.exe',['-NoProfile','-ExecutionPolicy','Bypass','-File',path.join(root,'test.ps1')],{encoding:'utf8',windowsHide:true});assert.equal(r.status,0,r.stdout+r.stderr);console.log(r.stdout.trim());console.log('PASS CC-Switch read-only, model mapping, app filtering and no credential disclosure');
