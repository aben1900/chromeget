$ErrorActionPreference='Stop'
$scriptFile=Join-Path $PSScriptRoot '..\native\diagnostics.ps1'
if(-not(Test-Path $scriptFile)){throw 'Diagnostics must exist'}
. $scriptFile
$fixture=Join-Path ([IO.Path]::GetTempPath()) ('chromeget-diag-'+[guid]::NewGuid().ToString('N'))
$r=Get-SetupDiagnostics -HostRoot $fixture -ExpectedExtensionId ('a'*32) -RegistrationPaths @()
if(-not($r.checks|Where-Object{$_.id -eq 'host' -and $_.state -eq 'fail'})){throw 'Missing host reported ready'}
if($r.checks|Where-Object{$_.id -eq 'browser' -and $_.state -eq 'pass'}){throw 'Inferred browser connection'}
[IO.Directory]::CreateDirectory($fixture)|Out-Null
@{directory=$fixture}|ConvertTo-Json|Set-Content (Join-Path $fixture 'config.json') -Encoding UTF8
@{path=(Join-Path $fixture 'host.cmd');allowed_origins=@('chrome-extension://'+('a'*32)+'/')}|ConvertTo-Json|Set-Content (Join-Path $fixture 'host.json') -Encoding UTF8
[IO.File]::WriteAllText((Join-Path $fixture 'host.cmd'),'')
[IO.File]::WriteAllText((Join-Path $fixture 'host.ps1'),'')
$r=Get-SetupDiagnostics -HostRoot $fixture -ExpectedExtensionId ('b'*32) -RegistrationPaths @((Join-Path $fixture 'host.json'))
if(-not($r.checks|Where-Object{$_.id -eq 'extension' -and $_.state -eq 'fail'})){throw 'Wrong ID accepted'}
if(-not($r.checks|Where-Object{$_.id -eq 'directory' -and $_.state -eq 'pass'})){throw 'Writable folder not detected'}
if(@(Get-ChildItem $fixture -Filter '*.tmp').Count){throw 'Probe was not removed'}
$r=Get-SetupDiagnostics -HostRoot 'Z:\wrong-root' -ExpectedExtensionId ('a'*32) -RegistrationPaths @((Join-Path $fixture 'host.json'))
if(-not($r.checks|Where-Object{$_.id -eq 'host' -and $_.state -eq 'pass'})){throw 'Registration target not used'}
$r=Get-SetupDiagnostics -HostRoot $fixture -RegistrationPaths @((Join-Path $fixture 'host.json'),(Join-Path $fixture 'different.json'))
if(-not($r.checks|Where-Object{$_.id -eq 'registration' -and $_.state -eq 'fail'})){throw 'Conflicting registrations accepted'}
Write-Output 'PASS missing host, actual registration target, mismatched ID, conflicting registration, writable folder and probe cleanup; no registry writes'
