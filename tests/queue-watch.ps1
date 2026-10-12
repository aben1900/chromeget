$ErrorActionPreference='Stop'
$root=Join-Path (Resolve-Path '.').Path ('work\watch-'+[Guid]::NewGuid().ToString('N'));$jobs=Join-Path $root 'video-jobs';[IO.Directory]::CreateDirectory($jobs)|Out-Null
foreach($file in @('recovery.ps1','gallery-image.ps1','video.ps1','video-worker.ps1','queue-watch.ps1')){Copy-Item -LiteralPath (Join-Path 'native' $file) -Destination $root}
. (Join-Path $root 'video.ps1')
Write-VideoJson (Join-Path $root 'video-settings.json') @{directory=$root;maxActive=1}
$first=Join-Path $jobs (([Guid]::NewGuid().ToString('N'))+'.json');$self=Get-Process -Id $PID
Write-VideoJson $first @{state='running';pid=$PID;started=$self.StartTime.ToUniversalTime().ToString('o');directory=$root;file='';error='';arguments=@('--continue','https://example.com/older-worker')}
$payload=Join-Path $root 'payload.bin';$fixture=Join-Path $root 'engine.ps1'
[IO.File]::WriteAllText($fixture,('[IO.File]::WriteAllText('''+$payload.Replace("'","''")+''',''abc'')'))
$second=Join-Path $jobs (([Guid]::NewGuid().ToString('N'))+'.json')
Write-VideoJson $second @{kind='files';state='starting';directory=$root;engine="$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe";arguments=@('-NoProfile','-ExecutionPolicy','Bypass','-File',$fixture);expectedFiles=@($payload);expectedSizes=@(3);file='';error=''}
Submit-DownloadJob $second
if((Read-VideoJson $second).state -ne 'queued'){throw 'Second task did not wait'}
$old=Read-VideoJson $first;$old.state='completed';Write-VideoJson $first $old
for($i=0;$i -lt 40;$i++){Start-Sleep -Milliseconds 250;$job=Read-VideoJson $second;if($job.state -in @('completed','failed')){break}}
if($job.state -ne 'completed'){throw 'Background watcher did not drain the queue without UI polling'}
Write-Output 'PASS background watcher advances queued task after old worker finishes, without UI or native job-list polling'
