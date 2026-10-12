$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot '..\native\video.ps1')
$expected='https://www.youtube.com/watch?v=d2UVNJSX7oA'
foreach($url in @($expected,'https://youtu.be/d2UVNJSX7oA?t=10','https://m.youtube.com/shorts/d2UVNJSX7oA','https://www.youtube.com/live/d2UVNJSX7oA','https://youtube.com/watch?v=d2UVNJSX7oA&list=abc')){
 if((Assert-VideoUrl $url) -ne $expected -or (Get-VideoSite $url) -ne 'youtube'){throw 'YouTube URL normalization failed'}
}
foreach($url in @('https://youtube.com.evil.com/watch?v=d2UVNJSX7oA','https://youtube.com/playlist?list=abc','https://youtube.com/watch?v=bad','https://user@youtube.com/watch?v=d2UVNJSX7oA')){
 $rejected=$false;try{Assert-VideoUrl $url|Out-Null}catch{$rejected=$true};if(-not $rejected){throw 'Invalid YouTube URL accepted'}
}
Write-Output 'PASS YouTube full, short, mobile, Shorts/live URLs, playlist exclusion, host validation'
$root=Join-Path (Resolve-Path (Join-Path $PSScriptRoot '..')).Path ('work\youtube-state-'+[Guid]::NewGuid().ToString('N'))
[IO.Directory]::CreateDirectory($root)|Out-Null
Copy-Item -LiteralPath (Join-Path $PSScriptRoot '..\native\video.ps1') -Destination (Join-Path $root 'video.ps1')
Copy-Item -LiteralPath (Join-Path $PSScriptRoot '..\native\gallery-image.ps1') -Destination $root
. (Join-Path $root 'video.ps1')
$jobs=Join-Path $root 'video-jobs';[IO.Directory]::CreateDirectory($jobs)|Out-Null
$id=[Guid]::NewGuid().ToString('N')
Write-VideoJson (Join-Path $jobs ($id+'.json')) @{state='running';pid=$PID;started=(Get-Process -Id $PID).StartTime.ToUniversalTime().ToString('o');error='';file='';directory=$root}
$result=Invoke-VideoAction ([pscustomobject]@{action='video-job';id=$id})
if($result.state -ne 'running'){throw 'Live process incorrectly marked stopped'}
Write-Output 'PASS running process detection with deserialized timestamp'
