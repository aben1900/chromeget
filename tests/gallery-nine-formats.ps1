$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot '..\native\video.ps1')
$root=Join-Path (Resolve-Path (Join-Path $PSScriptRoot '..')).Path ('work\gallery-nine-'+[Guid]::NewGuid().ToString('N'))
[IO.Directory]::CreateDirectory($root)|Out-Null
$ffmpeg=(Resolve-Path (Join-Path $PSScriptRoot '..\native\bin\ffmpeg.exe')).Path
Add-Type -AssemblyName System.Drawing
$bitmap=New-Object Drawing.Bitmap(16,16)
try {
 $bitmap.SetPixel(8,8,[Drawing.Color]::Red)
 foreach($entry in @(@('jpg','Jpeg'),@('png','Png'),@('gif','Gif'),@('bmp','Bmp'),@('tiff','Tiff'))){$bitmap.Save((Join-Path $root ('fixture.'+$entry[0])),[Drawing.Imaging.ImageFormat]::($entry[1]))}
}finally{$bitmap.Dispose()}
foreach($entry in @(@('webp','libwebp'),@('ico','bmp'),@('avif','libaom-av1'))){
 & $ffmpeg -hide_banner -loglevel error -i (Join-Path $root 'fixture.png') -frames:v 1 -c:v $entry[1] (Join-Path $root ('fixture.'+$entry[0]))
 if($LASTEXITCODE -ne 0){throw 'Failed to create real fixture'}
}
$svg='<?xml version="1.0" encoding="utf-8"?><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16"><rect width="16" height="16" fill="red"/></svg>'
[IO.File]::WriteAllText((Join-Path $root 'fixture.svg'),$svg,(New-Object Text.UTF8Encoding($true)))
foreach($ext in @('jpg','png','gif','bmp','svg','webp','ico','tiff','avif')){
 $bytes=[IO.File]::ReadAllBytes((Join-Path $root ('fixture.'+$ext)))
 if((Get-GalleryImageExtension $bytes) -ne $ext){throw "Incorrect signature detection: $ext"}
}
Write-Output 'PASS nine real image signatures including BOM/XML SVG'
foreach($xml in @('<html><svg xmlns="http://www.w3.org/2000/svg"/></html>','<!DOCTYPE svg [<!ENTITY x SYSTEM "file:///C:/Windows/win.ini">]><svg xmlns="http://www.w3.org/2000/svg">&x;</svg>','<svg xmlns="http://www.w3.org/2000/svg"><g></svg>')){
 $rejected=$false;try{Get-GalleryImageExtension ([Text.Encoding]::UTF8.GetBytes($xml))|Out-Null}catch{$rejected=$true};if(-not $rejected){throw 'Non-SVG or dangerous XML identified as SVG'}
}
# Every newly accepted raster input must actually decode and encode all existing output formats.
foreach($inputExt in @('bmp','ico','tiff','avif')){foreach($outputFormat in @('jpeg','png','webp')){
 $destination=Join-Path $root ($inputExt+'-converted.'+$outputFormat)
 Convert-GalleryImage (Join-Path $root ('fixture.'+$inputExt)) $destination $outputFormat $ffmpeg
 $expected=if($outputFormat -eq 'jpeg'){'jpg'}else{$outputFormat}
 if((Get-GalleryImageExtension ([IO.File]::ReadAllBytes($destination))) -ne $expected){throw 'Wrong converted bytes'}
}}
$rejected=$false;try{Convert-GalleryImage (Join-Path $root 'fixture.svg') (Join-Path $root 'svg.png') 'png' $ffmpeg}catch{$rejected=$true};if(-not $rejected){throw 'SVG conversion must be explicitly unsupported'}
Write-Output 'PASS BMP/ICO/TIFF/AVIF real JPEG/PNG/WEBP conversion and SVG original-only guard'
function SvgUrl([string]$xml){return 'data:image/svg+xml;base64,'+[Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($xml))}
$inline=SvgUrl $svg
if((Assert-GalleryImage $inline 'webpage') -ne $inline){throw 'Valid inline SVG rejected'}
$boundaryPrefix='<svg xmlns="http://www.w3.org/2000/svg"><desc>';$boundarySuffix='</desc></svg>'
$boundary=SvgUrl ($boundaryPrefix+('a'*(131072-$boundaryPrefix.Length-$boundarySuffix.Length))+$boundarySuffix)
if((Assert-GalleryImage $boundary 'webpage') -ne $boundary){throw '128 KiB SVG boundary must be accepted'}
foreach($xml in @('<svg xmlns="http://www.w3.org/2000/svg"><script/></svg>','<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"/>','<svg xmlns="http://www.w3.org/2000/svg"><foreignObject/></svg>','<svg xmlns="http://www.w3.org/2000/svg"><animate/></svg>','<svg xmlns="http://www.w3.org/2000/svg"><use href="https://example.com/a"/></svg>','<svg xmlns="http://www.w3.org/2000/svg"><rect style="fill:url(https://example.com/a)"/></svg>','<svg xmlns="http://www.w3.org/2000/svg"><rect fill="url(https://example.com/a)"/></svg>','<svg xmlns="http://www.w3.org/2000/svg"><image href="data:image/png;base64,AAAA"/></svg>','<?xml-stylesheet href="https://example.com/a"?><svg xmlns="http://www.w3.org/2000/svg"/>','<svg xmlns="http://www.w3.org/2000/svg"><g xml:base="https://example.com/"><use href="#x"/></g></svg>')){
 $rejected=$false;try{Assert-GalleryImage (SvgUrl $xml) 'webpage'|Out-Null}catch{$rejected=$true};if(-not $rejected){throw "Unsafe inline SVG accepted: $xml"}
}
foreach($url in @('data:image/png;base64,AAAA',(SvgUrl ('<svg xmlns="http://www.w3.org/2000/svg"><desc>'+('a'*131072)+'</desc></svg>')))){
 $rejected=$false;try{Assert-GalleryImage $url 'webpage'|Out-Null}catch{$rejected=$true};if(-not $rejected){throw 'Oversized or non-SVG inline data accepted'}
}
function Invoke-GalleryNetwork {throw 'Inline SVG must not use network'}
function Invoke-GalleryHead {throw 'Inline SVG must not use HEAD'}
function Submit-DownloadJob($jobPath){}
function Find-ExistingDownload($jobs,$candidate,$activeOnly){return ''}
$preview=Save-WebGalleryPreview ([pscustomobject]@{url='https://example.com/page';title='Inline';images=@(@{url=$inline;width=16;height=16})}) $root $root
$metadata=Get-GalleryImageInfo ([pscustomobject]@{draftId=$preview.draftId;index=0}) $root
if($metadata.format -ne 'svg' -or $metadata.bytes -ne [Text.Encoding]::UTF8.GetByteCount($svg) -or $metadata.canConvert -ne $false){throw 'Inline SVG metadata incorrect'}
$result=Start-GalleryJob ([pscustomobject]@{draftId=$preview.draftId;confirmed=$true}) $root $root
$jobPath=Join-Path $root ($result.id+'.json');$job=Read-VideoJson $jobPath
Invoke-GalleryDownload $job $jobPath (Join-Path $root 'inline.log')
if([IO.File]::ReadAllText((Join-Path $result.directory '001.svg')) -ne $svg){throw 'Inline original bytes changed'}
Write-Output 'PASS inline SVG validation, metadata and original download without network'
# Decoded per-image and serialized aggregate limits are independent; duplicate URLs cost only once.
$largeImages=@(foreach($i in 1..4){@{url=(SvgUrl ('<svg xmlns="http://www.w3.org/2000/svg"><desc>'+('a'*110000)+$i+'</desc></svg>'))}})
$bounded=Save-WebGalleryPreview ([pscustomobject]@{url='https://example.com/page';images=$largeImages}) $root $root
if($bounded.images.Count -ne 3){throw 'Inline aggregate budget did not cap preview'}
$draftPath=Join-Path $root ($bounded.draftId+'.gallery.json');$draft=Read-VideoJson $draftPath;$draft.images=$largeImages;Write-VideoJson $draftPath $draft
$rejected=$false;try{Read-GalleryDraft ([pscustomobject]@{draftId=$bounded.draftId}) $root|Out-Null}catch{$rejected=$true};if(-not $rejected){throw 'Tampered draft exceeded inline aggregate budget'}
$rejected=$false;try{Assert-GalleryImage $inline 'xiaohongshu'|Out-Null}catch{$rejected=$true};if(-not $rejected){throw 'Inline SVG widened XHS allowlist'}
foreach($entry in @(@('image/bmp','bmp'),@('image/svg+xml','svg'),@('image/vnd.microsoft.icon','ico'),@('image/tiff','tiff'),@('image/avif','avif'))){
 if((Get-GalleryMetadataFormat ($entry[0]+'; charset=utf-8') 'https://example.com/wrong.jpg?fmt=png') -ne $entry[1]){throw 'PowerShell MIME priority failed'}
}
foreach($entry in @(@('https://example.com/file.TIF?cache=123','tiff'),@('https://example.com/file.jpg?fmt=AVIF','avif'))){if((Get-GalleryMetadataFormat '' $entry[0]) -ne $entry[1]){throw 'PowerShell URL fallback failed'}}
Write-Output 'PASS inline size bounds, tampered draft rejection, source allowlist and metadata priority'
# Mock only the public network boundary; run the original worker and compare actual nine-format files.
function Invoke-GalleryNetwork([string]$url,[string]$sourceKind,[string]$method,[string]$destination){
 if($sourceKind -ne 'webpage' -or $method -ne 'GET' -or $url -notmatch '^https://example\.com/fixture\.(jpg|png|gif|bmp|svg|webp|ico|tiff|avif)$'){throw 'Unexpected fixture request'}
 [IO.File]::Copy((Join-Path $root ('fixture.'+$Matches[1])),$destination)
}
$exts=@('jpg','png','gif','bmp','svg','webp','ico','tiff','avif')
$preview=Save-WebGalleryPreview ([pscustomobject]@{url='https://example.com/page';title='Nine originals';images=@(foreach($ext in $exts){@{url=('https://example.com/fixture.'+$ext);width=16;height=16}})}) $root $root
$result=Start-GalleryJob ([pscustomobject]@{draftId=$preview.draftId;confirmed=$true}) $root $root
$jobPath=Join-Path $root ($result.id+'.json');$job=Read-VideoJson $jobPath
Invoke-GalleryDownload $job $jobPath (Join-Path $root 'nine.log')
for($i=0;$i -lt $exts.Count;$i++){
 $file=Join-Path $result.directory ('{0:D3}.{1}' -f ($i+1),$exts[$i])
 if((Get-FileHash -LiteralPath $file).Hash -ne (Get-FileHash -LiteralPath (Join-Path $root ('fixture.'+$exts[$i]))).Hash){throw 'Original image bytes changed'}
}
if($job.completedCount -ne 9 -or @(Get-ChildItem -LiteralPath $result.directory -Filter '*.part*').Count){throw 'Worker did not finish cleanly'}
Write-Output 'PASS nine original formats downloaded with byte identity and no temporary files'
