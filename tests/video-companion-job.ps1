$ErrorActionPreference='Stop'
$root=Join-Path (Resolve-Path (Join-Path $PSScriptRoot '..')).Path ('work\companion-job-'+[Guid]::NewGuid().ToString('N'))
[IO.Directory]::CreateDirectory($root)|Out-Null
foreach($name in @('video.ps1','gallery-image.ps1','video-companion.ps1')){Copy-Item (Join-Path $PSScriptRoot ('..\native\'+$name)) $root}
. (Join-Path $root 'video.ps1')
$jobs=Join-Path $root 'video-jobs';[IO.Directory]::CreateDirectory($jobs)|Out-Null
$url='https://www.xiaohongshu.com/explore/6557c3d40?xsec_token=PRIVATE'
$draft=New-VideoCompanionDraft ([pscustomobject]@{title='果冻码头';description='原文';uploader='作者'}) $url $url $jobs 'xiaohongshu'
$image=Join-Path $root 'image.png';[IO.File]::WriteAllBytes($image,[Convert]::FromBase64String('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/lWQAAAAASUVORK5CYII='))
$added=Add-VideoCompanionFiles $draft.draftId @($image) $jobs
$message=[pscustomobject]@{companionDraftId=$draft.draftId;companionTitle='编辑标题';companionText='Day 2';companionImageIds=@($added.images[0].id)}
$snapshot=Commit-VideoCompanion $message $url $jobs
if($snapshot.title -ne '编辑标题' -or $snapshot.text -ne 'Day 2' -or @($snapshot.images).Count -ne 1 -or $snapshot.digest -notmatch '^[a-f0-9]{64}$'){throw '任务未固化配套快照'}
if($snapshot.publicSourceUrl -match 'PRIVATE'){throw '快照泄露来源令牌'}
$different=Commit-VideoCompanion ([pscustomobject]@{companionDraftId=$draft.draftId;companionTitle='编辑标题';companionText='另一份正文';companionImageIds=@($added.images[0].id)}) $url $jobs
if($different.digest -eq $snapshot.digest){throw '不同编辑生成相同快照'}
try{Commit-VideoCompanion ([pscustomobject]@{companionDraftId=$draft.draftId;companionTitle='编辑标题';companionText='x';companionImageIds=@(('b'*32))}) $url $jobs|Out-Null;throw '伪造图片编号被接受'}catch{if($_.Exception.Message -eq '伪造图片编号被接受'){throw}}
try{Commit-VideoCompanion $message 'https://www.xiaohongshu.com/explore/another' $jobs|Out-Null;throw '串帖快照被接受'}catch{if($_.Exception.Message -eq '串帖快照被接受'){throw}}
function Get-VideoSettings{return [pscustomobject]@{directory=(Join-Path $root 'downloads');cookies='';xhsCookies=''}}
function Get-VideoTools{return @{engine='mock';ffmpeg=(Join-Path $root 'ffmpeg.exe')}}
function Get-ParallelVideoArgs($settings){return @()}
function Submit-DownloadJob($path){}
$start=Invoke-VideoActionCore ([pscustomobject]@{action='video-start';url=$url;height=0;mediaMode='video';companionDraftId=$draft.draftId;companionTitle='编辑标题';companionText='Day 2';companionImageIds=@($added.images[0].id)})
$job=Read-VideoJson (Join-Path $jobs ($start.id+'.json'))
if($job.companion.digest -ne $snapshot.digest){throw '开始下载未保留配套快照'}
try{Invoke-VideoActionCore ([pscustomobject]@{action='video-start';url=$url;height=0;mediaMode='video';companionDraftId=$draft.draftId;companionTitle='编辑标题';companionText='新正文';companionImageIds=@($added.images[0].id)})|Out-Null;throw '不同编辑被旧任务吞掉'}catch{if($_.Exception.Message -eq '不同编辑被旧任务吞掉'){throw}}
Write-Output 'PASS scoped immutable video companion snapshot and duplicate digest'
