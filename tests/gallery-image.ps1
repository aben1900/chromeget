$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot '..\native\video.ps1')
if(-not (Get-Command Get-GalleryImageInfo -ErrorAction SilentlyContinue)){throw 'Gallery image info action is missing'}
$root=Join-Path (Resolve-Path (Join-Path $PSScriptRoot '..')).Path ('work\gallery-image-test-'+[Guid]::NewGuid().ToString('N'))
[IO.Directory]::CreateDirectory($root)|Out-Null
$info=[pscustomobject]@{id='abcdef';title='Format variants';gallery_images=@([pscustomobject]@{url='https://sns-webpic-qc.xhscdn.com/one';width=16;height=16})}
$preview=Save-GalleryPreview $info 'https://www.xiaohongshu.com/explore/abcdef' $root $root
$script:headCalls=0
function Invoke-GalleryHead([string]$url){$script:headCalls++;if($url -ne 'https://sns-webpic-qc.xhscdn.com/one'){throw 'Unexpected remote URL'};return @{format='webp';bytes=12345}}
$metadata=Get-GalleryImageInfo ([pscustomobject]@{draftId=$preview.draftId;index=0;url='http://127.0.0.1/private'}) $root
if($metadata.format -ne 'webp' -or $metadata.bytes -ne 12345 -or $metadata.width -ne 16 -or $metadata.height -ne 16){throw 'Image metadata not resolved from trusted draft'}
foreach($index in @(-1,1,'0',0.5,$null)){
 $rejected=$false;try{Get-GalleryImageInfo ([pscustomobject]@{draftId=$preview.draftId;index=$index}) $root|Out-Null}catch{$rejected=$true}
 if(-not $rejected){throw 'Invalid image index accepted'}
}
if($script:headCalls -ne 1){throw 'Invalid request reached remote server'}
$draftPath=Join-Path $root ($preview.draftId+'.gallery.json');$draft=Read-VideoJson $draftPath
$draft.created=(Get-Date).ToUniversalTime().AddMinutes(-31).ToString('o');Write-VideoJson $draftPath $draft
$rejected=$false;try{Get-GalleryImageInfo ([pscustomobject]@{draftId=$preview.draftId;index=0}) $root|Out-Null}catch{$rejected=$true};if(-not $rejected){throw 'Expired draft accepted'}
$draft.created=(Get-Date).ToUniversalTime().ToString('o');$draft.images[0].url='https://127.0.0.1/private';Write-VideoJson $draftPath $draft
$rejected=$false;try{Get-GalleryImageInfo ([pscustomobject]@{draftId=$preview.draftId;index=0}) $root|Out-Null}catch{$rejected=$true};if(-not $rejected){throw 'Tampered draft URL accepted'}
$draft.images[0].url='https://sns-webpic-qc.xhscdn.com/one';Write-VideoJson $draftPath $draft
function Invoke-GalleryHead([string]$url){throw 'HTTP unavailable'}
$metadata=Get-GalleryImageInfo ([pscustomobject]@{draftId=$preview.draftId;index=0}) $root
if(-not $metadata.ok -or $null -ne $metadata.bytes -or $metadata.format -ne ''){throw 'Failed HEAD did not degrade gracefully'}
function Submit-DownloadJob($jobPath){}
function Find-ExistingDownload($jobs,$candidate,$activeOnly){return ''}
$rejected=$false;try{Start-GalleryJob ([pscustomobject]@{draftId=$preview.draftId;confirmed=$true;imageFormat='../bad'}) $root $root|Out-Null}catch{$rejected=$true};if(-not $rejected){throw 'Invalid image format accepted'}
$original=Start-GalleryJob ([pscustomobject]@{draftId=$preview.draftId;confirmed=$true}) $root $root
$variant=Start-GalleryJob ([pscustomobject]@{draftId=$preview.draftId;confirmed=$true;imageFormat='jpeg'}) $root $root
$job=Read-VideoJson (Join-Path $root ($variant.id+'.json'))
if($job.imageFormat -ne 'jpeg' -or $variant.directory -ne (Join-Path $original.directory 'JPEG')){throw 'Format variant did not get isolated folder'}
if((Get-DownloadKey @{kind='gallery';directory='C:\album'}) -eq (Get-DownloadKey @{kind='gallery';directory='C:\album';imageFormat='webp'})){throw 'Format jobs share reuse key'}
Write-Output 'PASS image metadata, index and trusted draft validation, HEAD failure fallback, format validation and isolated jobs'
Add-Type -AssemblyName System.Drawing
$source=Join-Path $root 'transparent.png'
$bitmap=New-Object Drawing.Bitmap(16,16);try{$bitmap.SetPixel(8,8,[Drawing.Color]::Red);$bitmap.Save($source,[Drawing.Imaging.ImageFormat]::Png)}finally{$bitmap.Dispose()}
$ffmpeg=(Resolve-Path (Join-Path $PSScriptRoot '..\native\bin\ffmpeg.exe')).Path
foreach($format in @('jpeg','png','webp')){
 $destination=Join-Path $root ('converted.'+$(if($format -eq 'jpeg'){'jpg'}else{$format}))
 Convert-GalleryImage $source $destination $format $ffmpeg
 $bytes=[IO.File]::ReadAllBytes($destination)
 $actual=Get-GalleryImageExtension $bytes
 if($actual -ne $(if($format -eq 'jpeg'){'jpg'}else{$format})){throw "Conversion did not create $format magic"}
 $rgba=Join-Path $root ($format+'.rgba')
 & $ffmpeg -hide_banner -loglevel error -i $destination -frames:v 1 -f rawvideo -pix_fmt rgba $rgba
 if($LASTEXITCODE -ne 0){throw 'Could not inspect converted pixels'}
 $pixels=[IO.File]::ReadAllBytes($rgba)
 if($pixels.Length -ne 1024){throw 'Conversion changed dimensions'}
 if($format -eq 'jpeg'){
  if($pixels[0] -lt 240 -or $pixels[1] -lt 240 -or $pixels[2] -lt 240 -or $pixels[3] -ne 255){throw 'JPEG transparent area is not white'}
 }elseif($pixels[3] -ne 0){throw "$format lost transparency"}
}
$rejected=$false;try{Convert-GalleryImage $source (Join-Path $root 'wrong.png') 'bad' $ffmpeg}catch{$rejected=$true};if(-not $rejected){throw 'Conversion accepted unknown format'}
Write-Output 'PASS real FFmpeg JPEG/PNG/WEBP encoding, signatures, dimensions, white JPEG background and preserved alpha'

# A format action must never remove a pre-existing destination.
$existing=Join-Path $root 'keep.png';[IO.File]::WriteAllText($existing,'keep')
$rejected=$false;try{Convert-GalleryImage $source $existing 'png' $ffmpeg}catch{$rejected=$true}
if(-not $rejected -or -not (Test-Path -LiteralPath $existing) -or [IO.File]::ReadAllText($existing) -ne 'keep'){throw 'Conversion overwrote or removed an existing file'}
# Page galleries keep ordinary public HTTP(S) URLs but exclude private destinations.
foreach($url in @('http://127.0.0.1/a','https://[::1]/a','http://10.1.2.3/a','http://172.16.0.1/a','http://192.168.1.1/a','http://169.254.169.254/a','https://localhost/a','https://printer.local/a','https://user:pass@example.com/a','https://example.com:444/a','file:///C:/a')){
 $rejected=$false;try{Assert-GalleryWebUrl $url|Out-Null}catch{$rejected=$true};if(-not $rejected){throw "Unsafe webpage image accepted: $url"}
}
$page=Save-WebGalleryPreview ([pscustomobject]@{url='https://huggingface.co/jialinyyzz/humanizer';title='Model';images=@([pscustomobject]@{url='https://huggingface.co/banner.png';width=400;height=300},[pscustomobject]@{url='http://127.0.0.1/private';width=1;height=1},[pscustomobject]@{url='https://huggingface.co/banner.png';width=400;height=300})}) $root $root
if($page.images.Count -ne 1 -or $page.sourceKind -ne 'webpage' -or $page.siteName -ne 'huggingface.co'){throw 'Webpage preview lost provenance or accepted duplicate/private images'}
$pageJob=Start-GalleryJob ([pscustomobject]@{draftId=$page.draftId;confirmed=$true}) $root $root
$saved=Read-VideoJson (Join-Path $root ($pageJob.id+'.json'))
if($saved.sourceKind -ne 'webpage' -or $saved.siteName -ne 'huggingface.co' -or $saved.directory -notlike '*Model*'){throw 'Webpage gallery job lost provenance'}
$rejected=$false;try{Assert-GalleryImage 'https://huggingface.co/banner.png'|Out-Null}catch{$rejected=$true};if(-not $rejected){throw 'XHS allowlist was widened'}
Add-Type -AssemblyName System.Net.Http
$response=New-Object Net.Http.HttpResponseMessage
try{
 $response.Content=New-Object Net.Http.ByteArrayContent(,[byte[]]@(1,2,3))
 $actual=Read-GalleryImageBody $response
 if($actual.Length -ne 3 -or $actual[2] -ne 3){throw 'Bounded response reader corrupted bytes'}
 $response.Content.Headers.ContentLength=33554433
 $rejected=$false;try{Read-GalleryImageBody $response|Out-Null}catch{$rejected=$true};if(-not $rejected){throw 'Oversized response accepted'}
}finally{$response.Dispose()}
Write-Output 'PASS existing-file preservation, generic page provenance, duplicate filtering, private URL guards and bounded response reader'
# Exercise the actual gallery worker with a fixed HTTP response and real FFmpeg.
$script:fixtureBytes=[IO.File]::ReadAllBytes($source)
function New-Object {
 param([string]$TypeName,[object[]]$ArgumentList)
 if($TypeName -eq 'Net.Http.HttpClientHandler'){
  $o=[pscustomobject]@{AllowAutoRedirect=$true;UseCookies=$true;UseDefaultCredentials=$true};$o|Add-Member ScriptMethod Dispose {};return $o
 }
 if($TypeName -eq 'Net.Http.HttpClient'){
  $agent=[pscustomobject]@{};$agent|Add-Member ScriptMethod ParseAdd {}
  $o=[pscustomobject]@{Timeout=$null;DefaultRequestHeaders=[pscustomobject]@{Referrer=$null;UserAgent=$agent}}
  $o|Add-Member ScriptMethod Dispose {}
  $o|Add-Member ScriptMethod GetAsync {
   param($url,$completion)
   if($url -ne 'https://sns-webpic-qc.xhscdn.com/one' -or $completion -ne [Net.Http.HttpCompletionOption]::ResponseHeadersRead){throw 'Worker used unexpected URL or buffered unbounded response'}
   $response=[Net.Http.HttpResponseMessage]::new();$response.Content=[Net.Http.ByteArrayContent]::new($script:fixtureBytes)
   $task=[pscustomobject]@{Result=$response};$task|Add-Member ScriptMethod GetAwaiter {return $this};$task|Add-Member ScriptMethod GetResult {return $this.Result};return $task
  };return $o
 }
 return Microsoft.PowerShell.Utility\New-Object -TypeName $TypeName -ArgumentList $ArgumentList
}
$jobPath=Join-Path $root ($variant.id+'.json');$job=Read-VideoJson $jobPath
Invoke-GalleryDownload $job $jobPath (Join-Path $root 'worker.log')
$output=Join-Path $variant.directory '001.jpg'
if($job.completedCount -ne 1 -or (Get-GalleryImageExtension ([IO.File]::ReadAllBytes($output))) -ne 'jpg'){throw 'Worker failed to encode selected format'}
if(@(Get-ChildItem -LiteralPath $variant.directory -Filter '*.part*').Count -ne 0){throw 'Worker left conversion temporary files'}
Write-Output 'PASS gallery worker uses selected format, real encoding and conversion temporary file cleanup'
# Changed or reordered page images must never reuse another numbered image file.
$basePage=@{url='https://huggingface.co/jialinyyzz/humanizer';title='Model';images=@(@{url='https://huggingface.co/a.png'},@{url='https://huggingface.co/b.png'})}
$first=Save-WebGalleryPreview ([pscustomobject]$basePage) $root $root
$same=Save-WebGalleryPreview ([pscustomobject]$basePage) $root $root
$basePage.images=@(@{url='https://huggingface.co/b.png'},@{url='https://huggingface.co/a.png'})
$reordered=Save-WebGalleryPreview ([pscustomobject]$basePage) $root $root
$basePage.images=@(@{url='https://huggingface.co/new.png'},@{url='https://huggingface.co/a.png'})
$changed=Save-WebGalleryPreview ([pscustomobject]$basePage) $root $root
$dirs=@(foreach($previewItem in @($first,$same,$reordered,$changed)){(Start-GalleryJob ([pscustomobject]@{draftId=$previewItem.draftId;confirmed=$true}) $root $root).directory})
if($dirs[0] -ne $dirs[1] -or $dirs[0] -eq $dirs[2] -or $dirs[2] -eq $dirs[3]){throw 'Changed or reordered page gallery reused numbered files'}
Write-Output 'PASS ordered image URLs determine webpage gallery identity, identical lists remain idempotent'
