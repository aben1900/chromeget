'use strict';
const fs=require('fs'),path=require('path'),assert=require('assert/strict'),{spawnSync}=require('child_process');
const file=path.resolve('work/ai-config-race.ps1');
fs.writeFileSync(file,'\ufeff'+`$ErrorActionPreference='Stop'
. '${path.resolve('native/ai.ps1').replaceAll("'","''")}'
$script:lockDepth=0;$script:requests=0;$script:changed=$false
function Invoke-AiConfigLock($root,$body){$script:lockDepth++;try{& $body}finally{$script:lockDepth--}}
function Get-AiPublicSettings($root){if($script:lockDepth -eq 0){throw 'CONFIG_LOCK_REQUIRED'};return @{defaultProfileId=$(if($script:changed){'b'}else{'a'});selectionRevision='s'}}
function Resolve-AiProfile($root,$id,$model){if($script:lockDepth -eq 0){throw 'CONFIG_LOCK_REQUIRED'};return @{profileId='a';revision='r';secret='fixture'}}
function Invoke-LibraryAction($message,$directory){switch($message.action){
 'library-ai-inspect' {return @{ok=$true;state='prepared';profileId='a';profileRevision='r';selectionRevision='s';model='m'}}
 'library-ai-claim' {if($script:lockDepth -eq 0){throw 'CONFIG_LOCK_REQUIRED'};return @{ok=$true;shouldSend=$true;text='fixture';length='short';executionToken='token'}}
 'library-ai-finish' {return @{ok=$true;state='completed'}}
 'library-ai-fail' {throw 'UNEXPECTED_FAILURE'}
}}
function Invoke-AiNode($payload){if($script:lockDepth -ne 0){throw 'NETWORK_UNDER_LOCK'};$script:requests++;return @{text='OK'}}
$first=Invoke-AiAction @{action='ai-generate';confirmed=$true;requestId='fixture'} 'fixture'
if(-not $first.ok -or $script:requests -ne 1){throw ('atomic claim missing: '+$first.code)}
$script:changed=$true
$second=Invoke-AiAction @{action='ai-generate';confirmed=$true;requestId='fixture'} 'fixture'
if($second.code -ne 'CONFIG_CHANGED' -or $script:requests -ne 1){throw 'changed default sent'}
Write-Output 'PASS configuration resolution and claim atomic; network outside lock; changed default cannot send'
`);const r=spawnSync('powershell.exe',['-NoProfile','-ExecutionPolicy','Bypass','-File',file],{encoding:'utf8',windowsHide:true});assert.equal(r.status,0,r.stdout+r.stderr);console.log(r.stdout.trim());
