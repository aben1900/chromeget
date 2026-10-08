$ErrorActionPreference='Stop'
$root=Join-Path (Resolve-Path '.').Path ('work\adaptive-'+[Guid]::NewGuid().ToString('N'));[IO.Directory]::CreateDirectory($root)|Out-Null
foreach($file in @('recovery.ps1','video.ps1','video-worker.ps1')){Copy-Item -LiteralPath (Join-Path 'native' $file) -Destination $root}
@'
function Start-VideoProcess($exe,$arguments,$stdoutPath,$stderrPath){
    $counter=Join-Path $PSScriptRoot 'attempt';$n=if(Test-Path $counter){[int][IO.File]::ReadAllText($counter)}else{0};$n++;[IO.File]::WriteAllText($counter,[string]$n)
    Write-VideoJson (Join-Path $PSScriptRoot ('args-'+$n+'.json')) @($arguments)
    [IO.File]::WriteAllText($stderrPath,'')
    if($n -lt 3){[IO.File]::WriteAllText($stdoutPath,'Exception: errorCode=5 too slow')}else{[IO.File]::WriteAllText($stdoutPath,'done');[IO.File]::WriteAllText((Join-Path $PSScriptRoot 'payload.bin'),'abc')}
    $p=[pscustomobject]@{Id=$PID;StartTime=(Get-Date);ExitCode=$(if($n -lt 3){1}else{0})}
    $p|Add-Member ScriptMethod WaitForExit {$true};$p|Add-Member ScriptMethod Refresh {};$p|Add-Member ScriptMethod Dispose {};return $p
}
'@ | Add-Content -LiteralPath (Join-Path $root 'video.ps1') -Encoding UTF8
. (Join-Path $root 'video.ps1')
$jobPath=Join-Path $root 'fixture.json'
Write-VideoJson $jobPath @{kind='files';adaptive=$true;state='starting';directory=$root;expectedFiles=@((Join-Path $root 'payload.bin'));expectedSizes=@(3);file='';error='';engine='mock';arguments=@('--continue=true','--split=64','--max-connection-per-server=16','--lowest-speed-limit=1K')}
& powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $root 'video-worker.ps1') -JobPath $jobPath
$job=Read-VideoJson $jobPath;$second=Read-VideoJson (Join-Path $root 'args-2.json');$third=Read-VideoJson (Join-Path $root 'args-3.json')
if($job.state -ne 'completed' -or $second -notcontains '--split=4' -or $second -contains '--lowest-speed-limit=1K' -or $third -notcontains '--split=1'){throw 'Adaptive downgrade failed'}
Write-Output 'PASS slow download retry downgrades 64 to 4 to 1, removes aggressive speed threshold, and preserves completion validation'
