'use strict';const fs=require('fs'),path=require('path'),assert=require('assert/strict'),{spawnSync}=require('child_process');const root=path.resolve('work/upgrade-native-'+Date.now());fs.mkdirSync(root,{recursive:true});for(const n of fs.readdirSync('native').filter(n=>/\.(ps1|cjs)$/.test(n)))fs.copyFileSync('native/'+n,path.join(root,n));fs.writeFileSync(path.join(root,'test.ps1'),'\ufeff'+`
$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot 'ai-config.ps1')
$ids=@([Guid]::NewGuid().ToString(),[Guid]::NewGuid().ToString(),[Guid]::NewGuid().ToString());$profiles=@{}
for($i=0;$i -lt 3;$i++){$id=$ids[$i];$key=if($i -eq 2){'sk-other'}else{'sk-fixture'};$profiles[$id]=@{profileId=$id;provider='custom';protocol='chat-completions';auth='bearer';baseUrl='https://example.test/v1';model=('m'+$i);label=('Model '+$i);tags=@('SMEC');revision='old';ciphertext=(Protect-AiKey $key);origin=@{source='workbuddy';sourceId=('s'+$i)};lastTest=@{revision='old';ok=$true;code='OK';at='2026-10-09'}}}
$old=@{schemaVersion=2;profiles=$profiles;defaultProfileId=$ids[1];selectionRevision='s';imports=@{completed=$true;ignored=@()}}
Write-AiSettings $PSScriptRoot $old;$raw=[IO.File]::ReadAllText((Join-Path $PSScriptRoot 'ai-settings.json'))
$pub=Get-AiPublicSettings $PSScriptRoot
if($pub.profiles.Count -ne 2 -or $pub.defaultProfileId -cne $ids[1]){throw 'group/default migration'}
if($pub.profiles.($ids[1]).models.Count -ne 2 -or -not $pub.profiles.($ids[1]).lastTest.ok){throw 'model/tests migration'}
$snap=@([IO.Directory]::GetFiles($PSScriptRoot,'ai-settings.pre-v3.*.json'));if($snap.Count -ne 1 -or [IO.File]::ReadAllText($snap[0]) -cne $raw){throw 'snapshot'}
$null=Get-AiPublicSettings $PSScriptRoot;if(@([IO.Directory]::GetFiles($PSScriptRoot,'ai-settings.pre-v3.*.json')).Count -ne 1){throw 'repeat snapshot'}
$p=Resolve-AiProfile $PSScriptRoot $ids[1] 'm1';if(($p|ConvertTo-Json -Depth 20) -match 'credentialFingerprint|ciphertext|origins'){throw 'resolved private models leaked'}
$receipt=Save-AiDraftTest $PSScriptRoot $p @{ok=$false;code='AUTH_FAILED';at='fixture'}
$saved=Save-AiSettings $PSScriptRoot @{profileId=$ids[1];expectedRevision=$pub.profiles.($ids[1]).revision;testReceipt=$receipt}
if($saved.profiles.($ids[1]).lastTest.ok){throw 'receipt not applied'}
$p=Resolve-AiProfile $PSScriptRoot $ids[1] 'm1';$receipt=Save-AiDraftTest $PSScriptRoot $p @{ok=$true;code='OK';at='fixture'}
$saved=Save-AiSettings $PSScriptRoot @{profileId=$ids[1];expectedRevision=$p.revision;model='m0';testReceipt=$receipt}
if($saved.profiles.($ids[1]).lastTest.code -ne 'OK'){throw 'wrong model test lost'}
# m1 must retain its failure; mismatching draft receipt must not overwrite it.
$back=Select-AiModel $PSScriptRoot @{profileId=$ids[1];expectedRevision=$saved.profiles.($ids[1]).revision;model='m1'}
if($back.profiles.($ids[1]).lastTest.ok){throw 'wrong receipt applied'}
Write-Output 'PASS encrypted upgrade snapshot, safe credentials grouping, defaults, privacy and bound draft receipts'
`);const r=spawnSync('powershell.exe',['-NoProfile','-ExecutionPolicy','Bypass','-File',path.join(root,'test.ps1')],{encoding:'utf8',windowsHide:true});assert.equal(r.status,0,r.stdout+r.stderr);console.log(r.stdout.trim());
