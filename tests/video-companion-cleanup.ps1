$ErrorActionPreference='Stop'
$root=Join-Path (Resolve-Path (Join-Path $PSScriptRoot '..')).Path ('work\companion-cleanup-'+[Guid]::NewGuid().ToString('N'))
[IO.Directory]::CreateDirectory($root)|Out-Null
foreach($name in @('video.ps1','gallery-image.ps1','video-companion.ps1')){Copy-Item (Join-Path $PSScriptRoot ('..\native\'+$name)) $root}
. (Join-Path $root 'video.ps1')
$jobs=Join-Path $root 'video-jobs';[IO.Directory]::CreateDirectory($jobs)|Out-Null
$url='https://www.xiaohongshu.com/explore/6557c3d40'
$png=[Convert]::FromBase64String('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/lWQAAAAASUVORK5CYII=')
$file=Join-Path $root 'image.png';[IO.File]::WriteAllBytes($file,$png)
$old=(Get-Date).ToUniversalTime().AddHours(-2)
$drafts=@();$images=@()
foreach($n in 1..2){
  $draft=New-VideoCompanionDraft ([pscustomobject]@{title='test';description='private';uploader='test'}) $url $url $jobs 'xiaohongshu'
  $added=Add-VideoCompanionFiles $draft.draftId @($file) $jobs
  $path=Join-Path $jobs ($draft.draftId+'.companion.json');$data=Read-VideoJson $path;$data.created=$old.ToString('o');Write-VideoJson $path $data
  $image=Join-Path $jobs ($draft.draftId+'.'+$added.images[0].id+'.companion-image');[IO.File]::SetLastWriteTimeUtc($image,$old)
  $drafts+=,$path;$images+=,$image
}
$id=[Guid]::NewGuid().ToString('N');$jobPath=Join-Path $jobs ($id+'.json')
Write-VideoJson $jobPath @{state='failed';companion=@{status='pending';images=@(@{stagedPath=$images[1]})}}
Clear-VideoCompanionGarbage $jobs
if((Test-Path $drafts[0]) -or (Test-Path $images[0])){throw '过期草稿或孤儿图片未清理'}
if((Test-Path $drafts[1]) -or -not (Test-Path $images[1])){throw '未完成任务的图片未保留'}
Write-VideoJson $jobPath @{state='completed';libraryWarning='资料库索引未更新';companion=@{status='complete';images=@(@{stagedPath=$images[1]})}}
Clear-VideoCompanionGarbage $jobs
if(-not (Test-Path $images[1])){throw '索引失败任务的重试图片未保留'}
Write-VideoJson $jobPath @{state='completed';companion=@{status='complete';images=@(@{stagedPath=$images[1]})}}
Clear-VideoCompanionGarbage $jobs
if(Test-Path $images[1]){throw '完成任务的暂存图片未清理'}
Write-Output 'PASS expired drafts and orphan images cleaned; unfinished job images preserved'
