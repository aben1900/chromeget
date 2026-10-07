$ErrorActionPreference='Stop'
$root=Join-Path (Resolve-Path '.').Path ('work\queue-test-'+[Guid]::NewGuid().ToString('N'));$jobs=Join-Path $root 'video-jobs';[IO.Directory]::CreateDirectory($jobs)|Out-Null
Copy-Item native/video.ps1 $root
. (Join-Path $root 'video.ps1')
Write-VideoJson (Join-Path $root 'video-settings.json') @{directory=$root;maxActive=2}
$script:launches=0
function Start-Process {param($FilePath,$ArgumentList,$WindowStyle);$script:launches++}
$ids=@()
for($n=0;$n -lt 4;$n++){
    $id=[Guid]::NewGuid().ToString('N');$ids+=$id;$path=Join-Path $jobs ($id+'.json')
    Write-VideoJson $path @{state='starting';directory=$root;createdAt=(Get-Date).ToUniversalTime().ToString('o');arguments=@('--continue',('https://example.com/'+$n));file='';error=''}
    Submit-DownloadJob $path
}
if($script:launches -ne 2){throw 'Queue exceeded concurrency cap'}
if((Read-VideoJson (Join-Path $jobs ($ids[2]+'.json'))).state -ne 'queued'){throw 'Third task not queued'}
$first=Read-VideoJson (Join-Path $jobs ($ids[0]+'.json'));$first.state='completed';Write-VideoJson (Join-Path $jobs ($ids[0]+'.json')) $first
Invoke-DownloadQueue
if($script:launches -ne 3 -or (Read-VideoJson (Join-Path $jobs ($ids[2]+'.json'))).state -ne 'starting'){throw 'Queue did not advance FIFO'}
Invoke-VideoAction ([pscustomobject]@{action='video-pause';id=$ids[3]})|Out-Null
if((Invoke-VideoAction ([pscustomobject]@{action='video-job';id=$ids[3]})).state -ne 'paused'){throw 'Cannot pause queued task'}
$r=Invoke-VideoAction ([pscustomobject]@{action='video-resume';id=$ids[3]})
if($r.id -ne $ids[3] -or (Read-VideoJson (Join-Path $jobs ($ids[3]+'.json'))).state -ne 'queued'){throw 'Resume bypassed queue or duplicated task'}
if((Get-DownloadCategory 'OllamaSetup.exe') -ne '程序' -or (Get-DownloadCategory 'model.gguf') -ne '模型'){throw 'Classification failed'}
Write-Output 'PASS global concurrency cap, FIFO advance, queued pause, same-ID queued resume and file categories'
