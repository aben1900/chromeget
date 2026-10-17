$ErrorActionPreference='Stop'
$root=Join-Path (Resolve-Path (Join-Path $PSScriptRoot '..')).Path ('work\tasks-'+[Guid]::NewGuid().ToString('N'))
[IO.Directory]::CreateDirectory($root)|Out-Null
Copy-Item -LiteralPath (Join-Path $PSScriptRoot '..\native\video.ps1') -Destination (Join-Path $root 'video.ps1')
Copy-Item -LiteralPath (Join-Path $PSScriptRoot '..\native\gallery-image.ps1') -Destination $root
Copy-Item -LiteralPath (Join-Path $PSScriptRoot '..\native\video-companion.ps1') -Destination $root
. (Join-Path $root 'video.ps1')
$jobs=Join-Path $root 'video-jobs';[IO.Directory]::CreateDirectory($jobs)|Out-Null
$id=[Guid]::NewGuid().ToString('N')
$arguments=@('--continue','-P',$root,'-o','fixed.%(ext)s','--','https://www.youtube.com/watch?v=d2UVNJSX7oA')
Write-VideoJson (Join-Path $jobs ($id+'.json')) @{state='failed';arguments=$arguments;directory=$root;engine='mock';error='network';file='';pid=123;started='2020-01-01T00:00:00Z'}
$list=Invoke-VideoAction ([pscustomobject]@{action='video-jobs'})
if($list.items.Count -ne 1 -or -not $list.items[0].canResume){throw 'Failed task not recoverable'}
function Start-Process {param($FilePath,$ArgumentList,$WindowStyle)}
[IO.File]::WriteAllText((Join-Path $root 'fixed.mp4.part'),'partial')
$resumed=Invoke-VideoAction ([pscustomobject]@{action='video-resume';id=$id})
$new=Read-VideoJson (Join-Path $jobs ($resumed.id+'.json'))
if(($new.arguments -join '|') -ne ($arguments -join '|') -or $new.directory -ne $root -or $new.pid -or $new.started){throw 'Resume lost original parameters'}
if([IO.File]::ReadAllText((Join-Path $root 'fixed.mp4.part')) -ne 'partial'){throw 'Partial file was modified'}
$list=Invoke-VideoAction ([pscustomobject]@{action='video-jobs'})
if($list.items.Count -ne 1 -or $resumed.id -ne $id){throw 'Resume created a duplicate task'}
$same=Invoke-VideoAction ([pscustomobject]@{action='video-resume';id=$resumed.id})
if($same.id -ne $resumed.id){throw 'Running/starting task duplicated'}
Write-Output 'PASS persisted task list, resume preserves directory/format/partial file, active task reuse'

Invoke-VideoAction ([pscustomobject]@{action='video-delete';id=$id})|Out-Null
$list=Invoke-VideoAction ([pscustomobject]@{action='video-jobs'})
if($list.items.Count -ne 0){throw 'Deleted task still visible'}
if([IO.File]::ReadAllText((Join-Path $root 'fixed.mp4.part')) -ne 'partial'){throw 'Deleting task removed downloaded file'}
$blocked=$false;try{Invoke-VideoAction ([pscustomobject]@{action='video-resume';id=$id})|Out-Null}catch{$blocked=$true}
if(-not $blocked){throw 'Deleted task resumed'}
Write-Output 'PASS resume reuses original ID, task deletion hides record and preserves partial file'
