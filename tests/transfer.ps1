$ErrorActionPreference='Stop'
$root=Join-Path (Resolve-Path (Join-Path $PSScriptRoot '..')).Path ('work\transfer-test-'+[Guid]::NewGuid().ToString('N'))
[IO.Directory]::CreateDirectory((Join-Path $root 'bin'))|Out-Null
foreach($name in @('video.ps1','transfer.ps1')){Copy-Item -LiteralPath (Join-Path $PSScriptRoot ('..\native\'+$name)) -Destination $root}
[IO.File]::WriteAllText((Join-Path $root 'bin\aria2c.exe'),'fixture')
. (Join-Path $root 'video.ps1')
Write-VideoJson (Join-Path $root 'video-settings.json') @{directory=(Join-Path $root 'downloads')}
function Invoke-RestMethod {param($Uri,$TimeoutSec)
    return [pscustomobject]@{sha=('a'*40);siblings=@([pscustomobject]@{rfilename='model-00001.safetensors';size=150000000000;lfs=@{sha256=('b'*64)}},[pscustomobject]@{rfilename='config.json';size=100;lfs=$null})}
}
function Start-Process {param($FilePath,$ArgumentList,$WindowStyle)}
$info=Invoke-VideoAction ([pscustomobject]@{action='video-hf-info';url='https://huggingface.co/org/model'})
if($info.totalBytes -ne 150000000100 -or $info.files.Count -ne 2){throw '64-bit file size failed'}
$result=Invoke-VideoAction ([pscustomobject]@{action='video-file-start';draftId=$info.draftId;selectedIndexes=@(1);confirmed=$true})
$job=Read-VideoJson (Join-Path $root ('video-jobs\'+$result.id+'.json'))
if($job.expectedFiles.Count -ne 1 -or $job.expectedFiles[0] -notlike '*config.json' -or $job.arguments -notcontains '--split=32' -or $job.arguments -notcontains '--max-connection-per-server=16'){throw 'Selected files / parallel flags wrong'}
$input=[IO.File]::ReadAllText((Join-Path $root ('video-jobs\'+$result.id+'.aria2.txt')))
if($input -notmatch '/resolve/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/config.json' -or $input -match 'safetensors'){throw 'Commit pin / subset failed'}
$same=Invoke-VideoAction ([pscustomobject]@{action='video-file-start';draftId=$info.draftId;selectedIndexes=@(1);confirmed=$true})
if($same.id -ne $result.id){throw 'Duplicate job'}
$blocked=$false;try{Invoke-VideoAction ([pscustomobject]@{action='video-file-start';draftId=$info.draftId;selectedIndexes=@(10);confirmed=$true})}catch{$blocked=$true};if(-not $blocked){throw 'Bad index accepted'}
. (Join-Path $root 'transfer.ps1')
foreach($bad in @('../escape','a/../b','C:/x','a\b','CON.txt','a/','x:stream','x.')){$blocked=$false;try{Assert-TransferPath $bad}catch{$blocked=$true};if(-not $blocked){throw "Unsafe path accepted: $bad"}}
Invoke-VideoAction ([pscustomobject]@{action='video-transfer-settings';transferMode='compatible'})|Out-Null
if((Get-TransferTuning (Get-VideoSettings)) -notcontains '--split=1'){throw 'Mode not persisted'}
if((Assert-VideoUrl 'https://x.com/user/status/123456') -ne 'https://x.com/i/web/status/123456'){throw 'X route failed'}
Write-Output 'PASS HF 150GB metadata, selected files, pinned revision, parallel flags, job reuse, path validation, speed persistence, X URL'

$file=Invoke-VideoAction ([pscustomobject]@{action='video-file-start';url='https://example.com/model.gguf';genericFile=$true;confirmed=$true})
$generic=Read-VideoJson (Join-Path $root ('video-jobs\'+$file.id+'.json'))
if($generic.expectedFiles[0] -notlike '*.gguf' -or $generic.expectedFiles[0] -like '*.mp4'){throw 'Generic file extension lost'}
$blocked=$false;try{Invoke-VideoAction ([pscustomobject]@{action='video-file-start';url='https://example.com/file';filename='../outside.exe';genericFile=$true;confirmed=$true})}catch{$blocked=$true};if(-not $blocked){throw 'Filename traversal accepted'}
Write-Output 'PASS generic file extension and explicit filename traversal protection'
# These calls exercise video-file-start, not only metadata parsing. The worker is mocked above.
foreach($size in @([long]2147483647,[long]2147483648,[long]22082529760,[long]150000000000)){
    $draftId=[Guid]::NewGuid().ToString('N')
    Write-VideoJson (Join-Path $root ('video-jobs\'+$draftId+'.files.json')) @{folder=('large-'+$size);title='large file regression';source='https://huggingface.co/org/model';files=@(@{name='model.gguf';size=$size;url=('https://huggingface.co/org/model/resolve/'+('a'*40)+'/model.gguf');sha256=''})}
    $large=Invoke-VideoAction ([pscustomobject]@{action='video-file-start';draftId=$draftId;selectedIndexes=@(0);confirmed=$true})
    $saved=Read-VideoJson (Join-Path $root ('video-jobs\'+$large.id+'.json'))
    if($saved.expectedSizes[0] -ne $size){throw "File size truncated: $size"}
    if(Test-Path -LiteralPath $saved.expectedFiles[0]){throw 'Regression test must not create large payloads'}
}
Write-Output 'PASS file-start space calculation at Int32 boundary, 22082529760 bytes and 150GB, without downloading payloads'
