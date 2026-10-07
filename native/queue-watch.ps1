$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot 'video.ps1')
$mutex=New-Object Threading.Mutex($false,'Local\JingcaiQueueWatcher');$held=$false
try{
    try{$held=$mutex.WaitOne(0)}catch [Threading.AbandonedMutexException]{$held=$true}
    if(-not $held){exit}
    $jobs=Join-Path $PSScriptRoot 'video-jobs'
    while(Test-Path -LiteralPath $jobs){
        Invoke-DownloadQueue
        $pending=$false
        foreach($entry in @(Get-ChildItem -LiteralPath $jobs -Filter '*.json' -File|Where-Object{$_.BaseName -match '^[a-f0-9]{32}$'})){
            if((Test-Path -LiteralPath ($entry.FullName+'.deleted')) -or (Test-Path -LiteralPath ($entry.FullName+'.paused'))){continue}
            try{if((Read-VideoJson $entry.FullName).state -eq 'queued'){$pending=$true;break}}catch{}
        }
        if(-not $pending){break}
        Start-Sleep -Seconds 3
    }
}finally{if($held){$mutex.ReleaseMutex()};$mutex.Dispose()}
