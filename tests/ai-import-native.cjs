'use strict';
const fs=require('fs'),path=require('path'),assert=require('assert/strict'),{spawnSync}=require('child_process'),{DatabaseSync}=require('node:sqlite');
const root=path.resolve('work/import-native-'+Date.now());fs.mkdirSync(path.join(root,'.cc-switch'),{recursive:true});for(const n of fs.readdirSync('native').filter(n=>/\.(ps1|cjs)$/.test(n)))fs.copyFileSync('native/'+n,path.join(root,n));
fs.mkdirSync(path.join(root,'bin'));fs.copyFileSync('native/bin/node.exe',path.join(root,'bin/node.exe'));
const db=new DatabaseSync(path.join(root,'.cc-switch','cc-switch.db'));db.exec('CREATE TABLE providers (id TEXT, app_type TEXT, name TEXT, settings_config TEXT)');db.prepare('INSERT INTO providers VALUES (?,?,?,?)').run('yqn','claude','SMEC',JSON.stringify({env:{ANTHROPIC_BASE_URL:'https://aigateway.smec-cn.com',ANTHROPIC_AUTH_TOKEN:'sk-fixture',ANTHROPIC_MODEL:'glm-5.2'}}));db.close();
fs.writeFileSync(path.join(root,'test.ps1'),'\ufeff'+`$ErrorActionPreference='Stop'
$env:USERPROFILE=$PSScriptRoot
. (Join-Path $PSScriptRoot 'ai-config.ps1')
. (Join-Path $PSScriptRoot 'ai-model-import.ps1')
$preview=New-AiImportPreview $PSScriptRoot 'ccswitch'
if($preview.items.Count -ne 1){throw 'preview'}
if(($preview|ConvertTo-Json -Depth 20).Contains('sk-fixture')){throw 'leak'}
$saved=Apply-AiImport $PSScriptRoot @{previewId=$preview.previewId;candidateIds=@($preview.items[0].candidateId)}
$model=@($saved.profiles.Values|Where-Object {$_.model -eq 'glm-5.2'})[0]
if(-not $model.hasKey){throw 'import key'}
$resolved=Resolve-AiProfile $PSScriptRoot $model.profileId ''
if($resolved.secret -cne 'sk-fixture'){throw 'cipher'}
$again=New-AiImportPreview $PSScriptRoot 'ccswitch'
if($again.items[0].change -ne 'same'){throw 'duplicate'}
$null=Remove-AiModel $PSScriptRoot @{profileId=$model.profileId;expectedRevision=$model.revision}
$deleted=New-AiImportPreview $PSScriptRoot 'ccswitch'
if($deleted.items[0].change -ne 'ignored'){throw 'resurrection'}
Write-Output 'PASS native encrypted import, duplicate preview and deletion suppression'
`);const r=spawnSync('powershell.exe',['-NoProfile','-ExecutionPolicy','Bypass','-File',path.join(root,'test.ps1')],{encoding:'utf8',windowsHide:true});assert.equal(r.status,0,r.stdout+r.stderr);console.log(r.stdout.trim());
