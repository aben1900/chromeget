$ErrorActionPreference='Stop'
$root=Join-Path (Resolve-Path (Join-Path $PSScriptRoot '..')).Path ('work\companion-info-'+[Guid]::NewGuid().ToString('N'))
[IO.Directory]::CreateDirectory($root)|Out-Null
foreach($name in @('video.ps1','gallery-image.ps1')){Copy-Item (Join-Path $PSScriptRoot ('..\native\'+$name)) $root}
if(Test-Path (Join-Path $PSScriptRoot '..\native\video-companion.ps1')){Copy-Item (Join-Path $PSScriptRoot '..\native\video-companion.ps1') $root}
. (Join-Path $root 'video.ps1')
if(Test-Path (Join-Path $root 'video-companion.ps1')){. (Join-Path $root 'video-companion.ps1')}
$jobs=Join-Path $root 'video-jobs';[IO.Directory]::CreateDirectory($jobs)|Out-Null
$url='https://www.xiaohongshu.com/explore/6557c3d40?xsec_token=secret&source=pc'
$info=[pscustomobject]@{title='果冻码头';description="Day 2`n从想要一座海边小镇开始";uploader='你的提示音';thumbnails=@(@{url='https://sns-webpic-qc.xhscdn.com/cover.jpg';width=640;height=960},@{url='http://127.0.0.1/private';width=900;height=900})}
$draft=New-VideoCompanionDraft $info $url $url $jobs 'xiaohongshu'
if($draft.text -notlike 'Day 2*' -or $draft.images.Count -ne 1 -or $draft.images[0].role -ne 'cover'){throw '当前帖元数据未正确入稿'}
if($draft.sourcePageUrl -match 'secret' -or $draft.sourcePageUrl -notmatch 'source=pc'){throw '公开来源链接清洗错误'}
if($draft.ContainsKey('url') -or $draft.ContainsKey('sourcePageRaw')){throw '浏览器响应泄露私有草稿字段'}
$saved=Read-VideoCompanionDraft $draft.draftId $url $jobs
if($saved.title -ne '果冻码头'){throw '草稿未持久化'}
try{$null=Read-VideoCompanionDraft $draft.draftId 'https://www.xiaohongshu.com/explore/another' $jobs;throw '串帖草稿被接受'}catch{if($_.Exception.Message -eq '串帖草稿被接受'){throw}}
$file=Join-Path $jobs ($draft.draftId+'.companion.json');$expired=Read-VideoJson $file;$expired.created=(Get-Date).ToUniversalTime().AddMinutes(-31).ToString('o');Write-VideoJson $file $expired
try{$null=Read-VideoCompanionDraft $draft.draftId $url $jobs;throw '过期草稿被接受'}catch{if($_.Exception.Message -eq '过期草稿被接受'){throw}}
Write-Output 'PASS scoped video companion metadata, public URL and expiry'
