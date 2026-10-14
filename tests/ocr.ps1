$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot '../native/ocr.ps1')
Add-Type -AssemblyName System.Drawing
$bitmap=[Drawing.Bitmap]::new(640,160);$graphics=[Drawing.Graphics]::FromImage($bitmap);$font=[Drawing.Font]::new('Arial',32)
$memory=[IO.MemoryStream]::new()
try {$graphics.Clear([Drawing.Color]::White);$graphics.DrawString('HELLO CHROME 123',$font,[Drawing.Brushes]::Black,20,40);$bitmap.Save($memory,[Drawing.Imaging.ImageFormat]::Png);$png='data:image/png;base64,'+[Convert]::ToBase64String($memory.ToArray())}finally{$font.Dispose();$graphics.Dispose();$bitmap.Dispose();$memory.Dispose()}
$result=Invoke-CaptureOcr @{png=$png}
if(-not $result.ok -or $result.text -notmatch 'HELLO' -or $result.text -notmatch '123'){throw ('OCR mismatch: '+$result.text)}
$chinese=-join @([char]0x4e2d,[char]0x6587,[char]0x6d4b,[char]0x8bd5)
$bitmap=[Drawing.Bitmap]::new(640,160);$graphics=[Drawing.Graphics]::FromImage($bitmap);$font=[Drawing.Font]::new('Microsoft YaHei',32);$memory=[IO.MemoryStream]::new()
try{$graphics.Clear([Drawing.Color]::White);$graphics.DrawString(($chinese+' ABC 123'),$font,[Drawing.Brushes]::Black,20,40);$bitmap.Save($memory,[Drawing.Imaging.ImageFormat]::Png);$png='data:image/png;base64,'+[Convert]::ToBase64String($memory.ToArray())}finally{$font.Dispose();$graphics.Dispose();$bitmap.Dispose();$memory.Dispose()}
$mixed=Invoke-CaptureOcr @{png=$png;language='zh-Hans-CN'}
if(($mixed.text -replace '\s','') -notmatch ($chinese+'ABC123')){throw ('Chinese OCR mismatch: '+$mixed.text)}
$rejected=$false;try{Invoke-CaptureOcr @{png='data:image/png;base64,aW52YWxpZA=='}}catch{$rejected=$true};if(-not $rejected){throw 'Invalid PNG accepted'}
Write-Output ('PASS real Windows OCR: '+$result.text+'; invalid PNG rejected')
Write-Output ('PASS Chinese and English mixed OCR: '+$mixed.text)
$saveDirectory=Join-Path (Split-Path $PSScriptRoot -Parent) ('work/capture-save-'+[Guid]::NewGuid().ToString('N'))
[IO.Directory]::CreateDirectory($saveDirectory)|Out-Null
$first=Save-RegionCapture @{png=$png;name='named capture';directory=$saveDirectory}
$second=Save-RegionCapture @{png=$png;name='named capture';directory=$saveDirectory}
if($first.filename -ne 'named capture.png' -or $second.filename -ne 'named capture (1).png'){throw 'Collision handling failed'}
if([Convert]::ToBase64String([IO.File]::ReadAllBytes($first.path)) -ne $png.Substring(22)){throw 'PNG bytes changed'}
$rejected=$false;try{Save-RegionCapture @{png=$png;name='../outside';directory=$saveDirectory}}catch{$rejected=$true};if(-not $rejected){throw 'Path traversal accepted'}
Write-Output 'PASS named PNG save, exact bytes, collision-safe names and path validation'
