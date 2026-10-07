$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot '..\native\video.ps1')
foreach ($url in @('file:///C:/secret','https://example.com/video/BV123','https://www.bilibili.com.evil.com/video/BV123','https://user@www.bilibili.com/video/BV123','https://www.bilibili.com:8443/video/BV123','--exec calc','https://www.bilibili.com/')) {
    $rejected=$false
    try { $null=Assert-BiliUrl $url } catch { $rejected=$true }
    if(-not $rejected){throw "Invalid URL accepted: $url"}
}
if ((Assert-BiliUrl 'https://www.bilibili.com/video/BV1vL411G7N7/?p=2') -notlike '*?p=2') {throw 'Lost part selection'}
$testRoot=Join-Path (Resolve-Path (Join-Path $PSScriptRoot '..')).Path ('work\video-unit-'+[Guid]::NewGuid().ToString('N'))
[IO.Directory]::CreateDirectory($testRoot)|Out-Null
$engine=(Get-VideoTools).engine
$process=Start-VideoProcess $engine @('--ignore-config','--version') (Join-Path $testRoot 'out.log') (Join-Path $testRoot 'err.log')
$process.WaitForExit();$process.Refresh()
if($process.ExitCode -ne 0){throw 'Engine exit code regression'}
$jobPath=Join-Path $testRoot 'failed.json'
Write-VideoJson $jobPath @{state='starting';directory=$testRoot;arguments=@('-NoProfile','-Command','Write-Error "expected failure"; exit 7');engine="$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe";error='';file=''}
& (Join-Path $PSScriptRoot '..\native\video-worker.ps1') -JobPath $jobPath
$job=Read-VideoJson $jobPath
if($job.state -ne 'failed' -or $job.error -notmatch 'expected failure'){throw 'Worker failed-state regression'}
Write-Output 'PASS Bilibili URL validation, part URL, engine launch/exit code, persistent worker failure'
