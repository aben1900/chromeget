$ErrorActionPreference='Stop'
$root=Join-Path (Resolve-Path '.').Path ('work\recovery-'+[Guid]::NewGuid().ToString('N'));[IO.Directory]::CreateDirectory($root)|Out-Null
. .\native\video.ps1
. .\native\transfer-probe.ps1
$path=Join-Path $root 'model.bin';$input=Join-Path $root 'input.txt';$jobPath=Join-Path $root 'job.json'
[IO.File]::WriteAllText($path,'partial');[IO.File]::WriteAllText(($path+'.aria2'),'map')
$job=[pscustomobject]@{directory=$root;expectedFiles=@($path);expectedSizes=@(100);arguments=@('--input-file='+$input);transferFiles=@([pscustomobject]@{url='https://huggingface.co/org/model/resolve/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/model.bin';size=100;sha256='';name='model.bin'})}
function Get-TransferProbe {param($url);return @{ok=$true;sizeKnown=$true;size=100;rangeSupported=$false;etag='same';contentType='application/octet-stream'}}
Prepare-FileTransfer $job $jobPath
if(Test-Path -LiteralPath $path){throw 'Non-range partial was not preserved separately'}
if(@(Get-ChildItem $root -Filter '*.partial-backup-*').Count -ne 2){throw 'Partial backups missing'}
$text=[IO.File]::ReadAllText($input)
if($text -notmatch 'jc_refresh=' -or $text -notmatch 'split=1' -or $text -notmatch 'max-connection-per-server=1'){throw 'Fresh HF URL or compatibility settings missing'}
[IO.File]::WriteAllText($path,'partial')
function Get-TransferProbe {param($url);return @{ok=$true;sizeKnown=$true;size=100;rangeSupported=$true;etag='changed';contentType='application/octet-stream'}}
$blocked=$false;try{Prepare-FileTransfer $job $jobPath}catch{$blocked=$true}
if(-not $blocked -or [IO.File]::ReadAllText($path) -ne 'partial'){throw 'Changed source was mixed into existing partial file'}
Write-Output 'PASS no-Range preserves partial backups, single-connection fallback, HF URL refresh and changed-version rejection'
$legacy=[pscustomobject]@{arguments=@('--input-file='+$input);expectedFiles=@($path);expectedSizes=@(100)}
Import-TransferDefinition $legacy
if($legacy.transferFiles.Count -ne 1 -or $legacy.transferFiles[0].size -ne 100 -or -not $legacy.adaptive){throw 'Legacy transfer upgrade failed'}
Write-Output 'PASS legacy aria2 task upgrades to probe/recovery without changing output paths'
