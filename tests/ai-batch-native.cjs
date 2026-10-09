'use strict';const fs=require('fs'),path=require('path'),assert=require('assert/strict'),{spawnSync}=require('child_process');const root=path.resolve('work/upgrade-native-'+Date.now());fs.mkdirSync(root,{recursive:true});for(const n of fs.readdirSync('native').filter(n=>/\.(ps1|cjs)$/.test(n)))fs.copyFileSync('native/'+n,path.join(root,n));fs.writeFileSync(path.join(root,'test.ps1'),'\ufeff'+`
$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot 'ai-config.ps1')
$ids=@([Guid]::NewGuid().ToString(),[Guid]::NewGuid().ToString(),[Guid]::NewGuid().ToString());$profiles=@{}
for($i=0;$i -lt 3;$i++){$id=$ids[$i];$key=if($i -eq 2){'sk-other'}else{'sk-fixture'};$profiles[$id]=@{profileId=$id;provider='custom';protocol='chat-completions';auth='bearer';baseUrl='https://example.test/v1';model=('m'+$i);label=('Model '+$i);tags=@('SMEC');revision='old';ciphertext=(Protect-AiKey $key);origin=@{source='workbuddy';sourceId=('s'+$i)};lastTest=@{revision='old';ok=($i -ne 2);code='OK';at='2026-10-09'}}}
$old=@{schemaVersion=2;profiles=$profiles;defaultProfileId=$ids[1];selectionRevision='s';imports=@{completed=$true;ignored=@()}}
Write-AiSettings $PSScriptRoot $old;$raw=[IO.File]::ReadAllText((Join-Path $PSScriptRoot 'ai-settings.json'))
$pub=Get-AiPublicSettings $PSScriptRoot
if($pub.profiles.Count -ne 2 -or $pub.defaultProfileId -cne $ids[1]){throw 'group/default migration'}
if($pub.profiles.($ids[1]).models.Count -ne 2 -or -not $pub.profiles.($ids[1]).lastTest.ok){throw 'model/tests migration'}
$snap=@([IO.Directory]::GetFiles($PSScriptRoot,'ai-settings.pre-v3.*.json'));if($snap.Count -ne 1 -or [IO.File]::ReadAllText($snap[0]) -cne $raw){throw 'snapshot'}
$null=Get-AiPublicSettings $PSScriptRoot;if(@([IO.Directory]::GetFiles($PSScriptRoot,'ai-settings.pre-v3.*.json')).Count -ne 1){throw 'repeat snapshot'}
$p=Resolve-AiProfile $PSScriptRoot $ids[1] 'm1';if(($p|ConvertTo-Json -Depth 20) -match 'credentialFingerprint|ciphertext|origins'){throw 'resolved private models leaked'}

$receipts=@()
foreach($model in @('m0','m1')){$p.model=$model;$receipts+=Save-AiDraftTest $PSScriptRoot $p @{ok=$true;code='OK';at='fixture'}}
$saved=Save-AiSettings $PSScriptRoot @{profileId=$ids[1];expectedRevision=$pub.profiles.($ids[1]).revision;testReceipts=$receipts}
foreach($m in $saved.profiles.($ids[1]).models){if(-not $m.lastTest.ok){throw 'batch receipt missing'}}
$chosen=Set-AiDefault $PSScriptRoot @{profileId=$ids[1];model='m0';expectedRevision=$saved.profiles.($ids[1]).revision;expectedSelectionRevision=$saved.selectionRevision}
if($chosen.profiles.($ids[1]).model -cne 'm0'){throw 'global default model not selected'}
try{$null=Set-AiDefault $PSScriptRoot @{profileId=$ids[1];model='m1';expectedRevision='stale';expectedSelectionRevision=$chosen.selectionRevision};throw 'stale accepted'}catch{if($_.Exception.Message -ne 'CONFIG_CHANGED'){throw}}
try{$null=Set-AiDefault $PSScriptRoot @{profileId=$ids[2];model='m2';expectedRevision=$chosen.profiles.($ids[2]).revision;expectedSelectionRevision=$chosen.selectionRevision};throw 'failed test accepted'}catch{if($_.Exception.Message -ne 'MODEL_NOT_TESTED'){throw}}
[IO.File]::WriteAllText((Join-Path $PSScriptRoot 'ai-settings.json'),$raw)
function Write-AiSettings($root,$settings){throw 'SIMULATED_COMMIT_FAIL'}
try{$null=Get-AiPublicSettings $PSScriptRoot;throw 'fault not triggered'}catch{if($_.Exception.Message -ne 'SIMULATED_COMMIT_FAIL'){throw}}
if([IO.File]::ReadAllText((Join-Path $PSScriptRoot 'ai-settings.json')) -cne $raw){throw 'old file corrupted'}
Write-Output 'PASS batch receipts per model, successful default atomic selection, stale/failed rejection'
`);const r=spawnSync('powershell.exe',['-NoProfile','-ExecutionPolicy','Bypass','-File',path.join(root,'test.ps1')],{encoding:'utf8',windowsHide:true});assert.equal(r.status,0,r.stdout+r.stderr);console.log(r.stdout.trim());
