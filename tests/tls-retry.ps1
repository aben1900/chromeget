$ErrorActionPreference='Stop'
$root=Join-Path (Resolve-Path '.').Path ('work\tls-test-'+[Guid]::NewGuid().ToString('N'));[IO.Directory]::CreateDirectory($root)|Out-Null
foreach($name in @('video.ps1','video-worker.ps1')){Copy-Item -LiteralPath (Join-Path 'native' $name) -Destination $root}
. (Join-Path $root 'video.ps1')
$base=Join-Path $root 'error-fixture'
[IO.File]::WriteAllLines(($base+'.out.log'),(@('Download aborted.','Exception: errorCode=1 SSL/TLS handshake failure: reset')+@(1..50|ForEach-Object{'generic summary'})))
$errorText=Get-DownloadFailure $base 1
if($errorText -notmatch 'handshake failure'){throw 'Actual error lost'}
if(-not (Test-TransientDownloadFailure $errorText)){throw 'TLS retry not recognized'}
if(Test-TransientDownloadFailure 'SSL/TLS handshake failure certificate verification failed'){throw 'Certificate errors must not retry as transient'}
$fixture=Join-Path $root 'engine.ps1'
@'
param($Folder)
$countFile=Join-Path $Folder 'count';$n=if(Test-Path $countFile){[int][IO.File]::ReadAllText($countFile)}else{0};$n++;[IO.File]::WriteAllText($countFile,[string]$n)
if($n -lt 2){Write-Output 'Exception: errorCode=1 SSL/TLS handshake failure: connection reset';exit 1}
[IO.File]::WriteAllText((Join-Path $Folder 'payload.bin'),'abc');exit 0
'@ | Set-Content -LiteralPath $fixture -Encoding UTF8
$jobPath=Join-Path $root 'fixture.json'
Write-VideoJson $jobPath @{kind='files';state='starting';directory=$root;expectedFiles=@((Join-Path $root 'payload.bin'));expectedSizes=@(3);file='';error='';engine="$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe";arguments=@('-NoProfile','-ExecutionPolicy','Bypass','-File',$fixture,'-Folder',$root)}
& powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $root 'video-worker.ps1') -JobPath $jobPath
$job=Read-VideoJson $jobPath
if($job.state -ne 'completed' -or $job.retryAttempt -ne 1 -or [IO.File]::ReadAllText((Join-Path $root 'count')) -ne '2'){throw ($job|ConvertTo-Json -Depth 5)}
Write-Output 'PASS actual TLS error extraction, certificate exclusion, worker retry and successful output verification'
[IO.File]::WriteAllText($fixture,([IO.File]::ReadAllText($fixture).Replace('if($n -lt 2)','if($true)')),(New-Object Text.UTF8Encoding($true)))
[IO.File]::WriteAllText((Join-Path $root 'count'),'0')
foreach($property in @('pid','started','childPid','childStarted','retryAttempt')){$job.PSObject.Properties.Remove($property)}
$job.state='starting';$job.file='';Write-VideoJson $jobPath $job
& powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $root 'video-worker.ps1') -JobPath $jobPath
$job=Read-VideoJson $jobPath
if($job.state -ne 'failed' -or [IO.File]::ReadAllText((Join-Path $root 'count')) -ne '3' -or $job.error -notmatch 'handshake failure'){throw 'TLS retry limit / final reason failed'}
Write-Output 'PASS persistent TLS failure stops after three attempts and preserves actual reason'
