$ErrorActionPreference='Stop'
$root=Join-Path (Resolve-Path (Join-Path $PSScriptRoot '..')).Path ('work\companion-files-'+[Guid]::NewGuid().ToString('N'))
[IO.Directory]::CreateDirectory($root)|Out-Null
foreach($name in @('video.ps1','gallery-image.ps1','video-companion.ps1')){Copy-Item (Join-Path $PSScriptRoot ('..\native\'+$name)) $root}
. (Join-Path $root 'video.ps1')
$jobs=Join-Path $root 'video-jobs';$directory=Join-Path $root 'downloads';[IO.Directory]::CreateDirectory($jobs)|Out-Null;[IO.Directory]::CreateDirectory($directory)|Out-Null
$url='https://www.xiaohongshu.com/explore/6557c3d40?xsec_token=PRIVATE'
$draft=New-VideoCompanionDraft ([pscustomobject]@{title='果冻码头';description='原文';uploader='作者'}) $url $url $jobs 'xiaohongshu'
$png=[Convert]::FromBase64String('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/lWQAAAAASUVORK5CYII=')
$file=Join-Path $root 'image.png';[IO.File]::WriteAllBytes($file,$png)
$added=Add-VideoCompanionFiles $draft.draftId @($file) $jobs
$snapshot=Commit-VideoCompanion ([pscustomobject]@{companionDraftId=$draft.draftId;companionTitle='编辑标题';companionText='Day 2';companionImageIds=@($added.images[0].id)}) $url $jobs
$media=Join-Path $directory 'movie.mp4';[IO.File]::WriteAllBytes($media,[byte[]](1,2,3))
$id=[Guid]::NewGuid().ToString('N');$jobPath=Join-Path $jobs ($id+'.json');$job=[pscustomobject]@{state='completed';file=$media;directory=$directory;source=$url;companion=([pscustomobject]$snapshot)}
Write-VideoCompanionFiles $job $jobPath
if($job.companion.status -ne 'complete' -or @($job.companion.files).Count -ne 2){throw '配套文件未完成'}
$note=@($job.companion.files|Where-Object{$_ -like '*.txt'})[0]
if(([IO.File]::ReadAllText($note,[Text.Encoding]::UTF8)) -match 'PRIVATE'){throw '说明泄露令牌'}
$before=@($job.companion.files);Write-VideoCompanionFiles $job $jobPath
if(@($job.companion.files).Count -ne 2 -or @($job.companion.files)[0] -ne $before[0]){throw '重复写入没有幂等'}
$savedImage=@($before|Where-Object{$_ -like '*.png'})[0];$staged=$job.companion.images[0].stagedPath
Remove-Item -LiteralPath $savedImage;Move-Item -LiteralPath $staged -Destination ($staged+'.held')
Write-VideoCompanionFiles $job $jobPath
if($job.companion.status -ne 'partial' -or @($job.companion.files).Count -ne 1){throw '配图失败未保留已完成视频和说明'}
Write-VideoJson $jobPath $job
function Invoke-DownloadQueue{}
$partial=Invoke-VideoActionCore ([pscustomobject]@{action='video-job';id=$id})
if($partial.companionStatus -ne 'partial' -or -not $partial.companionRetryable){throw '配套失败状态未反馈'}
$unfinished=Invoke-VideoActionCore ([pscustomobject]@{action='video-jobs';statusFilter='unfinished';offset=0})
if(@($unfinished.items|Where-Object{$_.id -eq $id}).Count -ne 1){throw '部分失败的完成视频未出现在未完成筛选'}
Move-Item -LiteralPath ($staged+'.held') -Destination $staged
function Get-VideoTools{return @{engine='mock';ffmpeg='mock'}}
$retry=Invoke-VideoActionCore ([pscustomobject]@{action='video-companion-retry';id=$id})
if($retry.companionStatus -ne 'complete' -or -not (Test-Path -LiteralPath $savedImage)){throw '重试未仅补齐配图'}
$status=Invoke-VideoActionCore ([pscustomobject]@{action='video-job';id=$id})
if($status.companionStatus -ne 'complete' -or $status.companionRetryable){throw '任务状态未显示配套结果'}
$outside=Join-Path $root 'outside';[IO.Directory]::CreateDirectory($outside)|Out-Null
$linked=Join-Path $directory 'linked';New-Item -ItemType Junction -Path $linked -Target $outside|Out-Null
$outsideMedia=Join-Path $outside 'escape.mp4';[IO.File]::WriteAllBytes($outsideMedia,[byte[]](1,2,3))
$job.file=Join-Path $linked 'escape.mp4'
try{Write-VideoCompanionFiles $job $jobPath;throw '链接目录逃逸被接受'}catch{if($_.Exception.Message -eq '链接目录逃逸被接受'){throw}}
Write-Output 'PASS companion sidecars beside media, public source and retry idempotence'
