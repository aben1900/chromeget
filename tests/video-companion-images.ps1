$ErrorActionPreference='Stop'
$root=Join-Path (Resolve-Path (Join-Path $PSScriptRoot '..')).Path ('work\companion-images-'+[Guid]::NewGuid().ToString('N'))
[IO.Directory]::CreateDirectory($root)|Out-Null
foreach($name in @('video.ps1','gallery-image.ps1')){Copy-Item (Join-Path $PSScriptRoot ('..\native\'+$name)) $root}
if(Test-Path (Join-Path $PSScriptRoot '..\native\video-companion.ps1')){Copy-Item (Join-Path $PSScriptRoot '..\native\video-companion.ps1') $root}
. (Join-Path $root 'video.ps1')
$jobs=Join-Path $root 'video-jobs';[IO.Directory]::CreateDirectory($jobs)|Out-Null
$url='https://www.xiaohongshu.com/explore/6557c3d40'
$info=[pscustomobject]@{title='Video';description='Text';uploader='Author';thumbnail='https://sns-webpic-qc.xhscdn.com/cover.png'}
$draft=New-VideoCompanionDraft $info $url $url $jobs 'xiaohongshu'
$png=[Convert]::FromBase64String('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/lWQAAAAASUVORK5CYII=')
$file=Join-Path $root 'chosen.png';[IO.File]::WriteAllBytes($file,$png)
$added=Add-VideoCompanionFiles $draft.draftId @($file) $jobs
if(@($added.images).Count -ne 1 -or $added.images[0].id -notmatch '^[a-f0-9]{32}$' -or $added.images[0].path){throw '本地图片未安全入稿'}
$stored=Read-VideoCompanionDraft $draft.draftId $url $jobs
if(@($stored.images).Count -ne 2 -or -not $stored.images[1].staged){throw '草稿没有暂存图片'}
$svg=Join-Path $root 'fake.svg';[IO.File]::WriteAllText($svg,'<svg xmlns="http://www.w3.org/2000/svg"></svg>')
try{Add-VideoCompanionFiles $draft.draftId @($svg) $jobs|Out-Null;throw 'SVG 被接受'}catch{if($_.Exception.Message -eq 'SVG 被接受'){throw}}
try{Add-VideoCompanionCapture $draft.draftId ('data:image/png;base64,'+[Convert]::ToBase64String($png)) 'https://www.xiaohongshu.com/explore/other' $jobs|Out-Null;throw '串帖截图被接受'}catch{if($_.Exception.Message -eq '串帖截图被接受'){throw}}
$capture=Add-VideoCompanionCapture $draft.draftId ('data:image/png;base64,'+[Convert]::ToBase64String($png)) $url $jobs
if($capture.images[0].id -notmatch '^[a-f0-9]{32}$'){throw '当前帖截图未入稿'}
function Invoke-GalleryNetwork([string]$imageUrl,[string]$sourceKind,[string]$method,[string]$destination,[int]$maxBytes=33554432){
    if($maxBytes -ne 8388608 -or $sourceKind -ne 'xiaohongshu'){throw '封面未使用安全的 8 MB 图片通道'}
    [IO.File]::WriteAllBytes($destination,$png)
    return @{ok=$true;format='png';bytes=$png.Length}
}
$cover=Stage-VideoCompanionCover $draft.draftId $draft.images[0].id $jobs
if($cover.images[0].role -ne 'cover'){throw '封面未暂存'}
function Get-VideoTools{return @{engine='mock';ffmpeg='mock'}}
$r=Invoke-VideoActionCore ([pscustomobject]@{action='video-companion-capture';draftId=$draft.draftId;png=('data:image/png;base64,'+[Convert]::ToBase64String($png));sourceUrl=$url})
if(-not $r.ok -or $r.images[0].source -ne '区域截图'){throw '本地动作未正确转发截图'}
Write-Output 'PASS companion image IDs, copied local image, rejected unsafe input and scoped capture'
