$ErrorActionPreference='Stop'
$root=Join-Path (Resolve-Path (Join-Path $PSScriptRoot '..')).Path ('work\companion-organize-'+[Guid]::NewGuid().ToString('N'))
[IO.Directory]::CreateDirectory($root)|Out-Null
foreach($name in @('video.ps1','gallery-image.ps1','video-companion.ps1')){Copy-Item -LiteralPath (Join-Path $PSScriptRoot ('..\native\'+$name)) -Destination $root}
. (Join-Path $root 'video.ps1')
. (Join-Path $PSScriptRoot '..\tools\organize-video-companion.ps1') -FunctionsOnly
$jobs=Join-Path $root 'video-jobs';$directory=Join-Path $root 'downloads';[IO.Directory]::CreateDirectory($jobs)|Out-Null;[IO.Directory]::CreateDirectory($directory)|Out-Null
$id='a'*32;$stem='【小红书】果冻码头 [123] [1280p]';$media=Join-Path $directory ($stem+'.mp4');[IO.File]::WriteAllBytes($media,[byte[]](1,2,3))
$oldFolder=Join-Path $directory ($stem+'-'+$id.Substring(0,8)+'-配套资料');[IO.Directory]::CreateDirectory($oldFolder)|Out-Null
$note=Join-Path $oldFolder '说明.txt';$image=Join-Path $oldFolder '封面.png';[IO.File]::WriteAllText($note,'test');[IO.File]::WriteAllBytes($image,[byte[]](4,5,6))
$jobPath=Join-Path $jobs ($id+'.json');Write-VideoJson $jobPath @{state='completed';file=$media;directory=$directory;companion=@{files=@($note,$image);images=@(@{savedPath=$image})}}
$script:refreshCount=0
$result=Move-VideoCompanionIntoFolder $jobPath {param($jobId)$script:refreshCount++;if($jobId -ne $id){throw 'Wrong job refreshed'}}
$updated=Read-VideoJson $jobPath
if($script:refreshCount -ne 1 -or $updated.fileLayout -ne 'video-folder-v1'){throw '任务未刷新或未标记新布局'}
if(-not (Test-Path -LiteralPath $updated.file -PathType Leaf)){throw '视频没有移入独立目录'}
if([IO.Path]::GetDirectoryName($updated.file) -ne $result.folder){throw '视频位置与任务不一致'}
if(-not (Test-Path -LiteralPath (Join-Path $result.folder '说明.txt')) -or -not (Test-Path -LiteralPath (Join-Path $result.folder '封面.png'))){throw '配套资料没有直接放在视频旁'}
if(Test-Path -LiteralPath (Join-Path $result.folder '配套资料')){throw '不应保留配套资料子目录'}
if($updated.companion.files[1] -ne $updated.companion.images[0].savedPath){throw '图片路径未更新'}
if((Test-Path -LiteralPath $media) -or (Test-Path -LiteralPath $oldFolder)){throw '旧位置仍留有文件'}
$nested=Join-Path $result.folder '配套资料';[IO.Directory]::CreateDirectory($nested)|Out-Null
Move-Item -LiteralPath (Join-Path $result.folder '说明.txt') -Destination $nested
Move-Item -LiteralPath (Join-Path $result.folder '封面.png') -Destination $nested
$updated.companion.files=@((Join-Path $nested '说明.txt'),(Join-Path $nested '封面.png'))
$updated.companion.images[0].savedPath=Join-Path $nested '封面.png'
Write-VideoJson $jobPath $updated
$script:refreshCount=0
$flattened=Move-VideoCompanionIntoFolder $jobPath {param($jobId)$script:refreshCount++}
$updated=Read-VideoJson $jobPath
if($flattened.already -or $script:refreshCount -ne 1 -or (Test-Path -LiteralPath $nested)){throw '已整理任务的配套子目录未被平铺'}
if($updated.companion.files[0] -ne (Join-Path $result.folder '说明.txt') -or $updated.companion.images[0].savedPath -ne (Join-Path $result.folder '封面.png')){throw '已整理任务的路径未同步更新'}
Write-Output 'PASS completed video and companion migrated into one folder with job paths refreshed'
