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
try{Add-VideoCompanionFiles '..\outside' @('unused') $jobs|Out-Null;throw '草稿路径输入被接受'}catch{if($_.Exception.Message -eq '草稿路径输入被接受'){throw};if($_.Exception.Message -notmatch '编号无效'){throw '草稿编号未先于文件读取被校验'}}
$png=[Convert]::FromBase64String('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/lWQAAAAASUVORK5CYII=')
$file=Join-Path $root 'chosen.png';[IO.File]::WriteAllBytes($file,$png)
$added=Add-VideoCompanionFiles $draft.draftId @($file) $jobs
if(@($added.images).Count -ne 1 -or $added.images[0].id -notmatch '^[a-f0-9]{32}$' -or $added.images[0].path){throw '本地图片未安全入稿'}
$stored=Read-VideoCompanionDraft $draft.draftId $url $jobs
if(@($stored.images).Count -ne 2 -or -not $stored.images[1].staged){throw '草稿没有暂存图片'}
$fakeWebp=Join-Path $root 'fake.webp';[IO.File]::WriteAllBytes($fakeWebp,[Text.Encoding]::ASCII.GetBytes('RIFF0000WEBPVP8 000000000000'))
$env:PATH=(Join-Path $PSScriptRoot '..\native\bin')+';'+$env:PATH
try{Add-VideoCompanionFiles $draft.draftId @($fakeWebp) $jobs|Out-Null;throw '伪造 WEBP 被接受'}catch{if($_.Exception.Message -eq '伪造 WEBP 被接受'){throw}}
$validWebp=Join-Path $root 'valid.webp';& ffmpeg.exe -v quiet -y -i $file $validWebp
if($LASTEXITCODE -ne 0){throw '测试 WEBP 生成失败'}
$webp=Add-VideoCompanionFiles $draft.draftId @($validWebp) $jobs
if($webp.images[0].format -ne 'webp' -or $webp.images[0].previewData -notmatch '^data:image/jpeg;base64,'){throw '有效 WEBP 未被接受或无法预览'}
$svg=Join-Path $root 'fake.svg';[IO.File]::WriteAllText($svg,'<svg xmlns="http://www.w3.org/2000/svg"></svg>')
try{Add-VideoCompanionFiles $draft.draftId @($svg) $jobs|Out-Null;throw 'SVG 被接受'}catch{if($_.Exception.Message -eq 'SVG 被接受'){throw}}
try{Add-VideoCompanionCapture $draft.draftId ('data:image/png;base64,'+[Convert]::ToBase64String($png)) 'https://www.xiaohongshu.com/explore/other' $jobs|Out-Null;throw '串帖截图被接受'}catch{if($_.Exception.Message -eq '串帖截图被接受'){throw}}
$capture=Add-VideoCompanionCapture $draft.draftId ('data:image/png;base64,'+[Convert]::ToBase64String($png)) $url $jobs
if($capture.images[0].id -notmatch '^[a-f0-9]{32}$'){throw '当前帖截图未入稿'}
function Invoke-GalleryNetwork([string]$imageUrl,[string]$sourceKind,[string]$method,[string]$destination,[int]$maxBytes=33554432){
    if($maxBytes -ne 8388608 -or $sourceKind -ne 'xiaohongshu'){throw '封面未使用安全的 8 MB 图片通道'}
    if($script:raceCover){$script:raceAdded=Add-VideoCompanionFiles $script:raceCover @($file) $jobs;$script:raceCover=$null}
    [IO.File]::WriteAllBytes($destination,$png)
    return @{ok=$true;format='png';bytes=$png.Length}
}
$cover=Stage-VideoCompanionCover $draft.draftId $draft.images[0].id $jobs
if($cover.images[0].role -ne 'cover'){throw '封面未暂存'}
$racing=New-VideoCompanionDraft $info $url $url $jobs 'xiaohongshu';$script:raceCover=$racing.draftId
$null=Stage-VideoCompanionCover $racing.draftId $racing.images[0].id $jobs
$afterRace=Read-VideoCompanionDraft $racing.draftId $url $jobs
if(@($afterRace.images).Count -ne 2 -or $afterRace.images[1].id -ne $script:raceAdded.images[0].id){throw '封面暂存覆盖了同时添加的配图'}
$null=Remove-VideoCompanionImage $racing.draftId $script:raceAdded.images[0].id $jobs
$replaced=Add-VideoCompanionFiles $racing.draftId @($file) $jobs
if(@($replaced.images).Count -ne 1){throw '移除配图后不能重新补图'}
foreach($n in 1..8){$null=Add-VideoCompanionFiles $racing.draftId @($file) $jobs}
try{Add-VideoCompanionFiles $racing.draftId @($file) $jobs|Out-Null;throw '超过十张被接受'}catch{if($_.Exception.Message -eq '超过十张被接受'){throw}}
$null=Remove-VideoCompanionImage $racing.draftId $replaced.images[0].id $jobs
$replaced=Add-VideoCompanionFiles $racing.draftId @($file) $jobs
if(@($replaced.images).Count -ne 1){throw '满十张移除后无法补图'}
function Get-VideoTools{return @{engine='mock';ffmpeg='mock'}}
$r=Invoke-VideoActionCore ([pscustomobject]@{action='video-companion-capture';draftId=$draft.draftId;png=('data:image/png;base64,'+[Convert]::ToBase64String($png));sourceUrl=$url})
if(-not $r.ok -or $r.images[0].source -ne '区域截图'){throw '本地动作未正确转发截图'}
Write-Output 'PASS companion image IDs, copied local image, rejected unsafe input and scoped capture'
