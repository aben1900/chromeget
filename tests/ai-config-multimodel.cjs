'use strict';
const fs=require('fs'),path=require('path'),{spawnSync}=require('child_process'),assert=require('assert/strict');
const root=path.resolve('work/multimodel-'+Date.now());fs.mkdirSync(root,{recursive:true});for(const n of fs.readdirSync('native').filter(n=>/\.(ps1|cjs)$/.test(n)))fs.copyFileSync('native/'+n,path.join(root,n));
fs.writeFileSync(path.join(root,'test.ps1'),'\ufeff'+`
$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot 'ai-config.ps1')
$saved=Save-AiSettings $PSScriptRoot @{label='Demo';tags=@('个人');provider='custom';protocol='chat-completions';baseUrl='https://example.test/v1';auth='bearer';key='sk-fixture';model='a';models=@(@{id='a';label='A'},@{id='b';label='B'})}
$id=$saved.profileId
if($saved.profiles.$id.models.Count -ne 2){throw 'model list lost'}
$chosen=Set-AiDefault $PSScriptRoot @{profileId=$id;expectedSelectionRevision=$saved.selectionRevision}
$p=Resolve-AiProfile $PSScriptRoot $id 'a'
Save-AiTestResult $PSScriptRoot $p @{revision=$p.revision;ok=$true;code='OK';at='fixture'}
$next=Select-AiModel $PSScriptRoot @{profileId=$id;model='b';expectedRevision=$p.revision}
if($next.profiles.$id.model -cne 'b' -or $next.selectionRevision -ceq $chosen.selectionRevision){throw 'selection not invalidated'}
if($next.profiles.$id.lastTest){throw 'wrong test on b'}
$temp=Resolve-AiProfile $PSScriptRoot $id 'a' -Temporary
if($temp.model -cne 'a'){throw 'temporary selection missing'}
$unchanged=Get-AiPublicSettings $PSScriptRoot
if($unchanged.profiles.$id.model -cne 'b' -or $unchanged.selectionRevision -cne $next.selectionRevision){throw 'temporary selection changed default'}
try{Resolve-AiProfile $PSScriptRoot $id 'b' -Temporary;throw 'untested accepted'}catch{if($_.Exception.Message -ne 'MODEL_NOT_TESTED'){throw}}
try{Resolve-AiProfile $PSScriptRoot $id 'missing' -Temporary;throw 'missing accepted'}catch{if($_.Exception.Message -ne 'MODEL_NOT_TESTED'){throw}}
Save-AiTestResult $PSScriptRoot $p @{revision=$p.revision;ok=$false;code='AUTH_FAILED'}
$back=Select-AiModel $PSScriptRoot @{profileId=$id;model='a';expectedRevision=$next.profiles.$id.revision}
if(-not $back.profiles.$id.lastTest.ok){throw 'a test lost or stale overwritten'}
try{Select-AiModel $PSScriptRoot @{profileId=$id;model='b';expectedRevision='stale'};throw 'stale accepted'}catch{if($_.Exception.Message -ne 'CONFIG_CHANGED'){throw}}
try{Select-AiModel $PSScriptRoot @{profileId=$id;model='missing';expectedRevision=$back.profiles.$id.revision};throw 'invalid accepted'}catch{if($_.Exception.Message -ne 'CONFIG_INVALID'){throw}}
$meta=Save-AiSettings $PSScriptRoot @{profileId=$id;expectedRevision=$back.profiles.$id.revision;label='Renamed';tags=@('SMEC')}
if(-not $meta.profiles.$id.lastTest.ok){throw 'metadata invalidates test'}
$key=Save-AiSettings $PSScriptRoot @{profileId=$id;expectedRevision=$meta.profiles.$id.revision;key='sk-fixture-new'}
if($key.profiles.$id.lastTest){throw 'new key keeps old test'}
if(($key|ConvertTo-Json -Depth 20) -match 'ciphertext|connectionRevision|credentialFingerprint|sk-fixture'){throw 'private fields leaked'}
Write-Output 'PASS multi-model native save, switch, per-model status, concurrency and privacy'
`);const r=spawnSync('powershell.exe',['-NoProfile','-ExecutionPolicy','Bypass','-File',path.join(root,'test.ps1')],{encoding:'utf8',windowsHide:true});process.stdout.write(r.stdout);process.stderr.write(r.stderr);assert.equal(r.status,0);
