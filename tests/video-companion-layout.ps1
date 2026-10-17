$ErrorActionPreference='Stop'
$root=Join-Path (Resolve-Path (Join-Path $PSScriptRoot '..')).Path ('work\companion-layout-'+[Guid]::NewGuid().ToString('N'))
[IO.Directory]::CreateDirectory($root)|Out-Null
foreach($name in @('video.ps1','gallery-image.ps1','video-companion.ps1')){Copy-Item -LiteralPath (Join-Path $PSScriptRoot ('..\native\'+$name)) -Destination $root}
. (Join-Path $root 'video.ps1')
$jobs=Join-Path $root 'video-jobs';$directory=Join-Path $root 'downloads';[IO.Directory]::CreateDirectory($jobs)|Out-Null;[IO.Directory]::CreateDirectory($directory)|Out-Null
$url='https://www.xiaohongshu.com/explore/6557c3d40'
$draft=New-VideoCompanionDraft ([pscustomobject]@{title='果冻码头';description='Day 2';uploader='作者'}) $url $url $jobs 'xiaohongshu'
function Get-VideoSettings{return [pscustomobject]@{directory=$directory;cookies='';xhsCookies=''}}
function Get-VideoTools{return @{engine='mock';ffmpeg=(Join-Path $root 'ffmpeg.exe')}}
function Get-ParallelVideoArgs($settings){return @()}
function Submit-DownloadJob($path){}
$start=Invoke-VideoActionCore ([pscustomobject]@{action='video-start';url=$url;height=0;mediaMode='video';companionDraftId=$draft.draftId;companionTitle='果冻码头';companionText='Day 2';companionImageIds=@()})
$jobPath=Join-Path $jobs ($start.id+'.json');$job=Read-VideoJson $jobPath
$outputIndex=[Array]::IndexOf([object[]]$job.arguments,'-o')
$outputTemplate=[string]$job.arguments[$outputIndex+1]
if($job.fileLayout -ne 'video-folder-v1' -or $outputTemplate -notmatch [regex]::Escape($start.id.Substring(0,8)) -or $outputTemplate -notmatch '[\\/]'){throw '新视频没有独立文件夹输出模板'}
$videoFolder=Join-Path $directory ('【小红书】果冻码头 ['+$start.id.Substring(0,8)+']')
[IO.Directory]::CreateDirectory($videoFolder)|Out-Null
$media=Join-Path $videoFolder 'video.mp4';[IO.File]::WriteAllBytes($media,[byte[]](1,2,3))
$job.file=$media;$job.state='completed'
Write-VideoCompanionFiles $job $jobPath
$note=@($job.companion.files|Where-Object{$_ -like '*.txt'})[0]
if(-not $note -or [IO.Path]::GetDirectoryName($note) -ne $videoFolder){throw '说明没有直接保存在视频旁'}
if(Test-Path -LiteralPath (Join-Path $videoFolder '配套资料')){throw '不应再建配套资料子目录'}
$plain=Invoke-VideoActionCore ([pscustomobject]@{action='video-start';url='https://www.xiaohongshu.com/explore/6557c3d41';height=0;mediaMode='video'})
$plainJob=Read-VideoJson (Join-Path $jobs ($plain.id+'.json'))
$plainTemplate=[string]$plainJob.arguments[([Array]::IndexOf([object[]]$plainJob.arguments,'-o')+1)]
if($plainJob.fileLayout -or $plainTemplate -match '[\\/]'){throw '无配套内容的视频不应新建文件夹'}
$emptyUrl='https://www.xiaohongshu.com/explore/6557c3d42'
$emptyDraft=New-VideoCompanionDraft ([pscustomobject]@{title='仅标题';description='';uploader='作者'}) $emptyUrl $emptyUrl $jobs 'xiaohongshu'
$empty=Invoke-VideoActionCore ([pscustomobject]@{action='video-start';url=$emptyUrl;height=0;mediaMode='video';companionDraftId=$emptyDraft.draftId;companionTitle='仅标题';companionText='  ';companionImageIds=@()})
$emptyJob=Read-VideoJson (Join-Path $jobs ($empty.id+'.json'))
if($emptyJob.fileLayout){throw '仅有标题或空白正文时不应新建文件夹'}
$imageUrl='https://www.xiaohongshu.com/explore/6557c3d43'
$imageDraft=New-VideoCompanionDraft ([pscustomobject]@{title='仅配图';description='';uploader='作者'}) $imageUrl $imageUrl $jobs 'xiaohongshu'
$png=[Convert]::FromBase64String('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/lWQAAAAASUVORK5CYII=')
$imagePath=Join-Path $root 'image.png';[IO.File]::WriteAllBytes($imagePath,$png)
$added=Add-VideoCompanionFiles $imageDraft.draftId @($imagePath) $jobs
$imageStart=Invoke-VideoActionCore ([pscustomobject]@{action='video-start';url=$imageUrl;height=0;mediaMode='video';companionDraftId=$imageDraft.draftId;companionTitle='仅配图';companionText='';companionImageIds=@($added.images[0].id)})
$imageJob=Read-VideoJson (Join-Path $jobs ($imageStart.id+'.json'))
if($imageJob.fileLayout -ne 'video-folder-v1'){throw '只有配图时也应与视频归入独立文件夹'}
Write-Output 'PASS video and companion files share one per-task folder'
