'use strict';
const fs=require('fs'),path=require('path'),assert=require('assert/strict'),{spawnSync}=require('child_process');
const root=path.resolve('work/model-config-'+Date.now());fs.mkdirSync(root,{recursive:true});
for(const n of fs.readdirSync('native').filter(n=>/\.(ps1|cjs)$/.test(n)))fs.copyFileSync('native/'+n,path.join(root,n));
const script=`$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot 'ai-config.ps1')
$a=Save-AiSettings $PSScriptRoot @{label='A';provider='openai';protocol='responses';baseUrl='https://example.test/v1';model='m';auth='bearer';key='sk-fixture'}
$id=$a.profileId
if(-not $id){throw 'new model ID missing'}
$b=Save-AiSettings $PSScriptRoot @{label='B';provider='openai';protocol='responses';baseUrl='https://example.test/v1';model='n';auth='bearer';key='sk-fixture-other'}
if($id -eq $b.profileId){throw 'same provider overwritten'}
try{Save-AiSettings $PSScriptRoot @{profileId=$id;label='blind write'};throw 'missing revision accepted'}catch{if($_.Exception.Message -ne 'CONFIG_CHANGED'){throw}}
$revision=$a.profiles.$id.revision
$before=[IO.File]::ReadAllText((Join-Path $PSScriptRoot 'ai-settings.json'))
$draft=Resolve-AiDraft $PSScriptRoot @{profileId=$id;expectedRevision=$revision;model='draft-model'}
if($draft.model -ne 'draft-model' -or $draft.secret -ne 'sk-fixture'){throw 'draft'}
if([IO.File]::ReadAllText((Join-Path $PSScriptRoot 'ai-settings.json')) -cne $before){throw 'draft persisted'}
try{Resolve-AiDraft $PSScriptRoot @{profileId=$id;expectedRevision=$revision;baseUrl='https://other.test'};throw 'leaked key'}catch{if($_.Exception.Message -ne 'KEY_NOT_CONFIGURED'){throw}}
$d=Set-AiDefault $PSScriptRoot @{profileId=$id;expectedSelectionRevision=$b.selectionRevision}
if($d.defaultProfileId -ne $id){throw 'default'}
try{Save-AiSettings $PSScriptRoot @{profileId=$id;expectedRevision='stale';label='wrong'};throw 'lost update'}catch{if($_.Exception.Message -ne 'CONFIG_CHANGED'){throw}}
$updated=Save-AiSettings $PSScriptRoot @{profileId=$id;expectedRevision=$revision;label='new label'}
if(-not $updated.profiles.$id.hasKey){throw 'lost cipher'}
$removed=Remove-AiModel $PSScriptRoot @{profileId=$id;expectedRevision=$updated.profiles.$id.revision}
if($removed.defaultProfileId -or $removed.profiles.$id){throw 'delete default'}
$json=Get-AiPublicSettings $PSScriptRoot|ConvertTo-Json -Depth 15
if($json.Contains('ciphertext') -or $json.Contains('sk-fixture')){throw 'public leak'}
Write-Output 'PASS multi-model storage, draft isolation, endpoint credential protection, conflicts and default deletion'
`;
fs.writeFileSync(path.join(root,'test.ps1'),'\ufeff'+script);const r=spawnSync('powershell.exe',['-NoProfile','-ExecutionPolicy','Bypass','-File',path.join(root,'test.ps1')],{encoding:'utf8',windowsHide:true});assert.equal(r.status,0,r.stdout+r.stderr);console.log(r.stdout.trim());
