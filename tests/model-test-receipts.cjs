const fs=require('fs'),path=require('path'),assert=require('assert/strict'),{spawnSync}=require('child_process');
const root=path.resolve('work/model-receipts-'+Date.now());fs.mkdirSync(root,{recursive:true});for(const file of fs.readdirSync('native').filter(f=>/\.(ps1|cjs)$/.test(f)))fs.copyFileSync('native/'+file,path.join(root,file));
fs.writeFileSync(path.join(root,'test.ps1'),'\ufeff'+`
$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot 'ai.ps1')
$script:nodeImpl=(Get-Item Function:Invoke-AiNode).ScriptBlock
function New-AiVisionProbe {return @{token='CG1234ABCD';png='data:image/png;base64,fixture'}}
function Invoke-AiNode($payload){if($payload.op -eq 'request'){return @{text=if($payload.vision){'CG1234ABCD'}else{'OK'}}};return & $script:nodeImpl $payload}
$draft=@{label='Demo';tags=@();provider='custom';protocol='chat-completions';baseUrl='https://example.test/v1';auth='bearer';key='sk-fixture';model='a';models=@(@{id='a';label='A'},@{id='b';label='B'})}
$txt=Invoke-AiAction @{action='ai-test-draft';draft=$draft;capability='txt';confirmed=$true} $PSScriptRoot
$ocr=Invoke-AiAction @{action='ai-test-draft';draft=$draft;capability='ocr';confirmed=$true} $PSScriptRoot
if(-not $txt.testReceipt -or -not $ocr.testReceipt){throw 'draft receipts missing'}
$draft.testReceipts=@($txt.testReceipt,$ocr.testReceipt)
$saved=Save-AiSettings $PSScriptRoot $draft
$id=$saved.profileId;$p=$saved.profiles.$id
if(-not $p.models[0].lastTest.ok -or -not $p.models[0].lastVisionTest.ok){throw 'separate TXT and OCR draft results lost'}
$other=Invoke-AiAction @{action='ai-test';profileId=$id;model='b';expectedRevision=$p.revision;confirmed=$true} $PSScriptRoot
if(-not $other.ok){throw ('non-current text model test failed: '+$other.code)}
$current=Get-AiPublicSettings $PSScriptRoot
if($current.profiles.$id.model -ne 'a' -or -not $current.profiles.$id.models[1].lastTest.ok){throw 'test changed current model or lost status'}
$legacy=Invoke-AiAction @{action='ai-test';profileId=$id;expectedRevision=$p.revision;confirmed=$true} $PSScriptRoot
if(-not $legacy.ok){throw 'current model omitted regression'}
Write-Output 'PASS optional OCR draft receipts preserve independent TXT/OCR; saved model test leaves selection unchanged'
`);const result=spawnSync('powershell.exe',['-NoProfile','-ExecutionPolicy','Bypass','-File',path.join(root,'test.ps1')],{encoding:'utf8',windowsHide:true});assert.equal(result.status,0,result.stdout+result.stderr);process.stdout.write(result.stdout);
