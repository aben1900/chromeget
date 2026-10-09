'use strict';
const fs=require('fs'),path=require('path'),assert=require('assert/strict'),{spawnSync}=require('child_process'),{DatabaseSync}=require('node:sqlite');
const root=path.resolve('work/import-native-'+Date.now());fs.mkdirSync(path.join(root,'.cc-switch'),{recursive:true});for(const n of fs.readdirSync('native').filter(n=>/\.(ps1|cjs)$/.test(n)))fs.copyFileSync('native/'+n,path.join(root,n));
fs.mkdirSync(path.join(root,'bin'));fs.copyFileSync('native/bin/node.exe',path.join(root,'bin/node.exe'));
const db=new DatabaseSync(path.join(root,'.cc-switch','cc-switch.db'));db.exec('CREATE TABLE providers (id TEXT, app_type TEXT, name TEXT, settings_config TEXT)');db.prepare('INSERT INTO providers VALUES (?,?,?,?)').run('yqn','claude','SMEC',JSON.stringify({env:{ANTHROPIC_BASE_URL:'https://aigateway.smec-cn.com',ANTHROPIC_AUTH_TOKEN:'sk-fixture',ANTHROPIC_MODEL:'glm-5.2'}}));db.close();
fs.writeFileSync(path.join(root,'rotate.cjs'),"const{DatabaseSync}=require('node:sqlite');const path=require('node:path');const db=new DatabaseSync(path.join(__dirname,'.cc-switch','cc-switch.db'));db.prepare(\"UPDATE providers SET settings_config=replace(settings_config, 'sk-fixture', 'sk-rotated')\").run();db.close();");
fs.writeFileSync(path.join(root,'test.ps1'),'\ufeff'+`$ErrorActionPreference='Stop'
$env:USERPROFILE=$PSScriptRoot
. (Join-Path $PSScriptRoot 'ai-config.ps1')
. (Join-Path $PSScriptRoot 'ai-model-import.ps1')
$a=New-AiImportPreview $PSScriptRoot 'ccswitch'
$b=New-AiImportPreview $PSScriptRoot 'ccswitch'
$s=Apply-AiImport $PSScriptRoot @{previewId=$b.previewId;candidateIds=@($b.items[0].candidateId)}
$p=@($s.profiles.Values|Where-Object {$_.model -eq 'glm-5.2'})[0]
$null=Remove-AiModel $PSScriptRoot @{profileId=$p.profileId;expectedRevision=$p.revision}
try{$null=Apply-AiImport $PSScriptRoot @{previewId=$a.previewId;candidateIds=@($a.items[0].candidateId)};throw 'deleted candidate resurrected'}catch{if($_.Exception.Message -ne 'IMPORT_CHANGED'){throw}}
Write-Output 'PASS stale import cannot resurrect concurrently deleted models'
`);const r=spawnSync('powershell.exe',['-NoProfile','-ExecutionPolicy','Bypass','-File',path.join(root,'test.ps1')],{encoding:'utf8',windowsHide:true});assert.equal(r.status,0,r.stdout+r.stderr);console.log(r.stdout.trim());
