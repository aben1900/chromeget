$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot '..\native\video.ps1')
function Assert-True($value,[string]$message){if(-not $value){throw $message}}
function Assert-Rejected([scriptblock]$action,[string]$message){$rejected=$false;try{& $action|Out-Null}catch{$rejected=$true};Assert-True $rejected $message}
Assert-True ([bool](Get-Command Save-GalleryCapture -ErrorAction SilentlyContinue)) 'Capture append action is missing'
$root=Join-Path (Resolve-Path (Join-Path $PSScriptRoot '..')).Path ('work\gallery-capture-'+[Guid]::NewGuid().ToString('N'))
[IO.Directory]::CreateDirectory($root)|Out-Null
Add-Type -AssemblyName System.Drawing
$bitmap=New-Object Drawing.Bitmap(17,11);$stream=New-Object IO.MemoryStream
try{$bitmap.SetPixel(8,5,[Drawing.Color]::Red);$bitmap.Save($stream,[Drawing.Imaging.ImageFormat]::Png);$pngBytes=$stream.ToArray()}finally{$stream.Dispose();$bitmap.Dispose()}
$png='data:image/png;base64,'+[Convert]::ToBase64String($pngBytes)
$standalone=Save-GalleryCapture ([pscustomobject]@{sourceUrl='https://example.com/page';sourceTitle='Standalone';png=$png}) $root $root
$standaloneDraft=Read-GalleryDraft $standalone $root
Assert-True ($standaloneDraft.images.Count -eq 1 -and $standaloneDraft.title -eq 'Standalone') 'First capture must create a standalone gallery'
$page=Save-WebGalleryPreview ([pscustomobject]@{url='https://example.com/page';title='Capture source';images=@(@{url='https://example.com/first.png';width=100;height=50},@{url='https://example.com/second.jpg';width=50;height=100})}) $root $root
$oldPath=Join-Path $root ($page.draftId+'.gallery.json');$oldText=[IO.File]::ReadAllText($oldPath)
$result=Save-GalleryCapture ([pscustomobject]@{draftId=$page.draftId;png=$png}) $root $root
Assert-True ($result.ok -and $result.draftId -ne $page.draftId -and $result.image.url -cmatch '^capture:[a-f0-9]{32}$') 'Capture must create an immutable draft and opaque token'
Assert-True ($null -eq $result.images -and $null -eq $result.png -and (ConvertTo-Json $result -Depth 5).Length -lt 2000) 'Capture response must remain small'
Assert-True ([IO.File]::ReadAllText($oldPath) -ceq $oldText) 'Append changed original draft'
$draft=Read-GalleryDraft $result $root
Assert-True ($draft.images.Count -eq 3 -and $draft.images[0].url -ceq $result.image.url -and $draft.images[1].url -ceq 'https://example.com/first.png' -and $draft.images[2].url -ceq 'https://example.com/second.jpg') 'Capture prepend lost image order'
Assert-True ($draft.sourceKind -ceq 'webpage' -and $draft.title -ceq 'Capture source' -and $draft.url -ceq 'https://example.com/page' -and $draft.siteName -ceq 'example.com') 'Capture lost source metadata'
$stored=Join-Path $root ($result.image.url.Substring(8)+'.capture.png')
Assert-True ([Convert]::ToBase64String([IO.File]::ReadAllBytes($stored)) -ceq [Convert]::ToBase64String($pngBytes)) 'Original capture bytes changed'
$metadata=Get-GalleryImageInfo ([pscustomobject]@{draftId=$result.draftId;index=0}) $root
Assert-True ($metadata.width -eq 17 -and $metadata.height -eq 11 -and $metadata.bytes -eq $pngBytes.Length -and $metadata.format -ceq 'png' -and $metadata.canConvert) 'Capture metadata is incorrect'
function Submit-DownloadJob($jobPath){}
$oldJob=Start-GalleryJob ([pscustomobject]@{draftId=$page.draftId;confirmed=$true;selectedIndexes=@(0)}) $root $root
$newJob=Start-GalleryJob ([pscustomobject]@{draftId=$result.draftId;confirmed=$true;selectedIndexes=@(0,2)}) $root $root
$selected=Read-VideoJson (Join-Path $root ($newJob.id+'.json'))
Assert-True ($newJob.directory -ne $oldJob.directory -and $selected.images[0].originalIndex -eq 1 -and $selected.images[1].originalIndex -eq 3 -and $selected.images[1].url -ceq 'https://example.com/second.jpg') 'Capture reused old folder or selection indexes'
$second=Save-GalleryCapture ([pscustomobject]@{draftId=$result.draftId;png=$png}) $root $root
Assert-True ((Read-GalleryDraft $second $root).noteId -ne $draft.noteId) 'Repeated append reused output folder identity'
$xhs=Save-GalleryPreview ([pscustomobject]@{id='abcdef';title='XHS';gallery_images=@(@{url='https://sns-webpic-qc.xhscdn.com/one';width=3;height=4})}) 'https://www.xiaohongshu.com/explore/abcdef' $root $root
$xhsResult=Save-GalleryCapture ([pscustomobject]@{draftId=$xhs.draftId;png=$png}) $root $root
$xhsDraft=Read-GalleryDraft $xhsResult $root
Assert-True ($xhsDraft.images.Count -eq 2 -and $xhsDraft.images[1].url -ceq 'https://sns-webpic-qc.xhscdn.com/one' -and $xhsDraft.sourceKind -ne 'webpage') 'Capture widened or lost XHS provenance'
Assert-Rejected {Assert-GalleryImage 'https://example.com/one.png' $xhsDraft.sourceKind} 'Capture widened XHS URL allowlist'
Write-Output 'PASS immutable prepend, small reply, exact bytes, metadata, selected indexes and both source kinds'
foreach($format in @('original','jpeg','png','webp')){
 $variant=Start-GalleryJob ([pscustomobject]@{draftId=$second.draftId;confirmed=$true;selectedIndexes=@(0);imageFormat=$format}) $root $root
 $jobPath=Join-Path $root ($variant.id+'.json');$job=Read-VideoJson $jobPath
 Invoke-GalleryDownload $job $jobPath (Join-Path $root ($format+'.log'))
 $ext=if($format -eq 'jpeg'){'jpg'}elseif($format -eq 'original'){'png'}else{$format}
 $bytes=[IO.File]::ReadAllBytes((Join-Path $variant.directory ('001.'+$ext)))
 Assert-True ((Get-GalleryImageExtension $bytes) -eq $ext -and $job.completedCount -eq 1) 'Capture worker saved wrong format'
 if($format -eq 'original'){Assert-True ([Convert]::ToBase64String($bytes) -ceq [Convert]::ToBase64String($pngBytes)) 'Worker changed original capture bytes'}
 Assert-True (@(Get-ChildItem -LiteralPath $variant.directory -Filter '*.part*').Count -eq 0) 'Worker left capture temporary files'
}
Write-Output 'PASS real capture worker original/JPEG/PNG/WEBP downloads'
foreach($bad in @('capture:../secret',('capture:'+('A'*32)),('capture:'+('a'*32)+'.png'),('capture:'+('a'*32)+"`n"),'file:///C:/Windows/win.ini','data:image/png;base64,AAAA')){Assert-Rejected {Assert-GalleryImage $bad 'webpage'} 'Unsafe capture token accepted'}
Assert-Rejected {Get-GalleryImageInfo ([pscustomobject]@{draftId='../other';index=0}) $root} 'Unsafe draft path accepted'
foreach($bad in @(('data:image/jpeg;base64,'+[Convert]::ToBase64String($pngBytes)),'data:image/png;base64,!!!!','data:image/png;base64,AAAA',($png+"`n"),('data:image/png;base64,'+[Convert]::ToBase64String((New-Object byte[] 8388609))))){Assert-Rejected {Save-GalleryCapture ([pscustomobject]@{draftId=$page.draftId;png=$bad}) $root $root} 'Invalid or oversized capture accepted'}
$huge=[byte[]]$pngBytes.Clone();$huge[16]=0;$huge[17]=0;$huge[18]=255;$huge[19]=255;$huge[20]=0;$huge[21]=0;$huge[22]=255;$huge[23]=255
Assert-Rejected {Save-GalleryCapture ([pscustomobject]@{draftId=$page.draftId;png=('data:image/png;base64,'+[Convert]::ToBase64String($huge))}) $root $root} 'PNG pixel limit bypassed'
$truncated=[byte[]]$pngBytes[0..32]
Assert-Rejected {Save-GalleryCapture ([pscustomobject]@{draftId=$page.draftId;png=('data:image/png;base64,'+[Convert]::ToBase64String($truncated))}) $root $root} 'Undecodable PNG header accepted'
$missing=[Guid]::NewGuid().ToString('N');$tampered=Read-GalleryDraft $second $root;$tampered.images[0].url='capture:'+$missing
$tamperedId=[Guid]::NewGuid().ToString('N');Write-VideoJson (Join-Path $root ($tamperedId+'.gallery.json')) $tampered
Assert-Rejected {Read-GalleryDraft @{draftId=$tamperedId} $root} 'Missing capture file accepted'
[IO.File]::WriteAllText((Join-Path $root ($missing+'.capture.png')),'not png')
Assert-Rejected {Get-GalleryImageInfo @{draftId=$tamperedId;index=0} $root} 'Tampered capture file accepted'
Write-Output 'PASS token/path, PNG decode, byte/pixel limits and trusted local file checks'
$hundred=@(foreach($i in 1..100){@{url=('https://example.com/'+$i+'.png')}})
$large=Save-WebGalleryPreview ([pscustomobject]@{url='https://example.com/page';images=$hundred}) $root $root
Assert-Rejected {Save-WebGalleryPreview ([pscustomobject]@{url='https://example.com/page';images=($hundred+@(@{url='https://example.com/101.png'}))}) $root $root} 'Webpage limit exceeded 100 originals'
for($i=0;$i -lt 20;$i++){$large=Save-GalleryCapture ([pscustomobject]@{draftId=$large.draftId;png=$png}) $root $root}
Assert-True ((Read-GalleryDraft $large $root).images.Count -eq 120) '100 originals plus 20 captures not supported'
Assert-Rejected {Save-GalleryCapture ([pscustomobject]@{draftId=$large.draftId;png=$png}) $root $root} 'Capture count exceeded 20'
Write-Output 'PASS separate 100 original / 20 capture limits'
# Exercise the binary native messaging frame with an isolated host and real large PNG.
$hostRoot=Join-Path $root 'host';[IO.Directory]::CreateDirectory($hostRoot)|Out-Null
foreach($name in @('host.ps1','recovery.ps1','video.ps1','gallery-image.ps1')){Copy-Item -LiteralPath (Join-Path $PSScriptRoot ('..\native\'+$name)) -Destination (Join-Path $hostRoot $name)}
Write-VideoJson (Join-Path $hostRoot 'config.json') @{directory=$hostRoot}
Write-VideoJson (Join-Path $hostRoot 'video-settings.json') @{directory=$hostRoot;cookies=''}
function Invoke-CaptureHost($message,[uint32]$declaredLength=0){
 $process=New-Object Diagnostics.Process;$process.StartInfo.FileName='powershell.exe'
 $process.StartInfo.Arguments='-NoProfile -NonInteractive -ExecutionPolicy Bypass -File '+(Quote-VideoArg (Join-Path $hostRoot 'host.ps1'))
 $process.StartInfo.UseShellExecute=$false;$process.StartInfo.CreateNoWindow=$true;$process.StartInfo.RedirectStandardInput=$true;$process.StartInfo.RedirectStandardOutput=$true;$process.StartInfo.RedirectStandardError=$true
 try{
  $null=$process.Start();$stderr=$process.StandardError.ReadToEndAsync();$output=New-Object IO.MemoryStream
  $read=$process.StandardOutput.BaseStream.CopyToAsync($output)
  $body=[Text.Encoding]::UTF8.GetBytes((ConvertTo-Json $message -Depth 8 -Compress));$size=if($declaredLength){$declaredLength}else{$body.Length}
  $process.StandardInput.BaseStream.Write([BitConverter]::GetBytes([uint32]$size),0,4)
  try{if(-not $declaredLength){$process.StandardInput.BaseStream.Write($body,0,$body.Length)}}catch [IO.IOException]{}
  try{$process.StandardInput.Close()}catch [IO.IOException]{}
  if(-not $process.WaitForExit(30000)){try{$process.Kill()}catch{};throw 'Native capture host timeout'}
  $read.GetAwaiter().GetResult();$bytes=$output.ToArray();$output.Dispose()
  Assert-True ($process.ExitCode -eq 0 -and $bytes.Length -ge 4 -and [BitConverter]::ToUInt32($bytes,0) -eq $bytes.Length-4) ('Invalid native response: '+$stderr.GetAwaiter().GetResult())
  return ([Text.Encoding]::UTF8.GetString($bytes,4,$bytes.Length-4)|ConvertFrom-Json)
 }finally{$process.Dispose()}
}
$framedPage=Invoke-CaptureHost @{action='video-gallery-preview';url='https://example.com/page';images=@(@{url='https://example.com/first.png'})}
Assert-True $framedPage.ok 'Framed gallery preview failed'
$bitmap=New-Object Drawing.Bitmap(700,700);$random=New-Object Random(42);$stream=New-Object IO.MemoryStream
try{
 for($y=0;$y -lt 700;$y++){for($x=0;$x -lt 700;$x++){$bitmap.SetPixel($x,$y,[Drawing.Color]::FromArgb(255,$random.Next(256),$random.Next(256),$random.Next(256)))}}
 $bitmap.Save($stream,[Drawing.Imaging.ImageFormat]::Png);$largePng='data:image/png;base64,'+[Convert]::ToBase64String($stream.ToArray())
}finally{$stream.Dispose();$bitmap.Dispose()}
Assert-True ($largePng.Length -gt 1048576 -and $largePng.Length -lt 11184834) 'Large PNG fixture does not exercise framing limit'
$framed=Invoke-CaptureHost @{action='video-gallery-capture';draftId=$framedPage.draftId;png=$largePng}
Assert-True ($framed.ok -and $framed.image.width -eq 700 -and $framed.image.height -eq 700) ('Large framed capture rejected: '+$framed.error)
$over=Invoke-CaptureHost @{action='status';padding=('x'*1048576)}
Assert-True (-not $over.ok -and $over.error -match '1 MB') 'Non-capture message exceeded 1 MiB'
$over=Invoke-CaptureHost @{} 12582913
Assert-True (-not $over.ok -and $over.error -match '12 MB') 'Native frame exceeded 12 MiB'
$status=Invoke-CaptureHost @{action='status'}
Assert-True ($status.capabilities -contains 'gallery-capture-v1') 'Connected host did not advertise capture support'
Write-Output 'PASS actual native framing: large PNG append, 1 MiB non-capture and 12 MiB total bounds, capability'
