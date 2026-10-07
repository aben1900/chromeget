$ErrorActionPreference='Stop'
$root=Join-Path (Resolve-Path (Join-Path $PSScriptRoot '..')).Path ('work\cancel-test-'+[Guid]::NewGuid().ToString('N'))
[IO.Directory]::CreateDirectory($root)|Out-Null
foreach($file in @('video.ps1','video-worker.ps1')){Copy-Item -LiteralPath (Join-Path $PSScriptRoot ('..\native\'+$file)) -Destination $root}
. (Join-Path $root 'video.ps1')
$jobs=Join-Path $root 'video-jobs';[IO.Directory]::CreateDirectory($jobs)|Out-Null
$id=[Guid]::NewGuid().ToString('N');$path=Join-Path $jobs ($id+'.json')
$exe="$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe"
Write-VideoJson $path @{state='starting';directory=$root;engine=$exe;arguments=@('-NoProfile','-Command','Start-Sleep -Seconds 30');error='';file=''}
$worker=Start-Process -FilePath $exe -ArgumentList ('-NoProfile -ExecutionPolicy Bypass -File '+(Quote-VideoArg (Join-Path $root 'video-worker.ps1'))+' -JobPath '+(Quote-VideoArg $path)) -WindowStyle Hidden -PassThru
try{
 for($n=0;$n -lt 40;$n++){Start-Sleep -Milliseconds 100;$job=Read-VideoJson $path;if($job.childPid){break}}
 if(-not $job.childPid){throw 'Test child did not start'}
 Invoke-VideoAction ([pscustomobject]@{action='video-delete';id=$id})|Out-Null
 Start-Sleep -Milliseconds 300
 if(Get-Process -Id $job.childPid -ErrorAction SilentlyContinue){throw 'Download child survived cancellation'}
 if((Invoke-VideoAction ([pscustomobject]@{action='video-jobs'})).items.Count){throw 'Deleted task reappeared'}
 Write-Output 'PASS deleting running task stops worker and child, and prevents record resurrection'
}finally{if(-not $worker.HasExited){$worker.Kill()}}
