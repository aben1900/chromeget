$ErrorActionPreference='Stop'
. "$PSScriptRoot\..\tools\update-release.ps1" -FunctionsOnly
$base=Join-Path $PSScriptRoot ('..\work\update-test-'+[Guid]::NewGuid().ToString('N'));$stage=Join-Path $base 'stage';$dest=Join-Path $base 'dest'
[IO.Directory]::CreateDirectory((Join-Path $stage 'extension'))|Out-Null;[IO.Directory]::CreateDirectory((Join-Path $dest 'extension'))|Out-Null
[IO.File]::WriteAllText((Join-Path $stage 'extension\a.js'),'new');[IO.File]::WriteAllText((Join-Path $dest 'extension\a.js'),'old');[IO.File]::WriteAllText((Join-Path $dest 'keep.json'),'private')
try{Install-ChromegetPackage $stage $dest {throw 'fixture failure'};throw 'expected failure'}catch{if($_ -notmatch 'fixture failure'){throw}}
if((Get-Content (Join-Path $dest 'extension\a.js')) -ne 'old'){throw 'Rollback failed'}
Install-ChromegetPackage $stage $dest {}
if((Get-Content (Join-Path $dest 'extension\a.js')) -ne 'new' -or (Get-Content (Join-Path $dest 'keep.json')) -ne 'private'){throw 'Update preservation failed'}
Write-Output 'PASS transactional update, failure rollback and private file preservation'
