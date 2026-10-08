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
@{name='cn.jingcai.clipper';type='stdio';path=(Join-Path $fixture 'host.cmd');allowed_origins=@('chrome-extension://'+('a'*32)+'/')}|ConvertTo-Json|Set-Content (Join-Path $fixture 'host.json') -Encoding UTF8
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
$bin=Join-Path $fixture 'bin';[IO.Directory]::CreateDirectory($bin)|Out-Null
$engines=@()
foreach($id in @('node','yt-dlp','aria2','ffmpeg')){
    $target=$id+'.exe';$file=Join-Path $bin $target;[IO.File]::WriteAllText($file,'test fixture - not executable')
    $hash=(Get-FileHash $file -Algorithm SHA256).Hash
    $engines+=@{id=$id;kind='exe';sha256=$hash;files=@(@{target=$target})}
    @{archiveSha256=$hash;files=@(@{name=$target;sha256=$hash})}|ConvertTo-Json -Depth 5|Set-Content (Join-Path $bin ($id+'-installed.json')) -Encoding UTF8
}
@{engines=$engines}|ConvertTo-Json -Depth 6|Set-Content (Join-Path $fixture 'engines.lock.json') -Encoding UTF8
$r=Get-SetupDiagnostics -HostRoot $fixture -RegistrationPaths @() -FullIntegrity
if(-not($r.checks|Where-Object{$_.id -eq 'integrity' -and $_.state -eq 'pass'})){throw 'Intact fixture rejected'}
[IO.File]::AppendAllText((Join-Path $bin 'node.exe'),'tampered')
$r=Get-SetupDiagnostics -HostRoot $fixture -RegistrationPaths @() -FullIntegrity
if(-not($r.checks|Where-Object{$_.id -eq 'integrity' -and $_.state -eq 'fail'})){throw 'Tampered engine accepted'}
Write-Output 'PASS full integrity checks installed receipts against fixed archive policy and rejects modified executable'

@{name='cn.jingcai.clipper';type='stdio';path=(Join-Path $fixture 'missing-host.cmd');allowed_origins=@('chrome-extension://'+('a'*32)+'/')}|ConvertTo-Json|Set-Content (Join-Path $fixture 'host.json') -Encoding UTF8
$r=Get-SetupDiagnostics -HostRoot $fixture -ExpectedExtensionId ('a'*32) -RegistrationPaths @((Join-Path $fixture 'host.json'))
if(-not($r.checks|Where-Object{$_.id -eq 'manifest' -and $_.state -eq 'fail'})){throw 'Missing exact registered launcher accepted'}
$r=Get-SetupDiagnostics -HostRoot 'Z:\actual-missing-host' -ExpectedExtensionId ('a'*32) -RegistrationPaths @((Join-Path $fixture 'host.json')) -ConnectedHost
if(-not($r.checks|Where-Object{$_.id -eq 'host' -and $_.state -eq 'fail'})){throw 'Actual host root was replaced by registry target'}
Write-Output 'PASS exact launcher validation and connected-host root isolation'
