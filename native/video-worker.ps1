param([string]$JobPath)
$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot 'video.ps1')
. (Join-Path $PSScriptRoot 'recovery.ps1')
$job = Read-VideoJson $JobPath
$base = $JobPath.Substring(0,$JobPath.Length-5)
$downloadMutex=$null;$downloadLocked=$false
try {
    if((Test-Path -LiteralPath ($JobPath+'.deleted')) -or (Test-Path -LiteralPath ($JobPath+'.paused'))){exit}
    $key=Get-DownloadKey $job
    $hash=[Security.Cryptography.SHA256]::Create()
    try {$name='Local\JingcaiDownload_'+[BitConverter]::ToString($hash.ComputeHash([Text.Encoding]::UTF8.GetBytes($key))).Replace('-','')} finally {$hash.Dispose()}
    $downloadMutex=New-Object Threading.Mutex($false,$name)
    try {$downloadLocked=$downloadMutex.WaitOne(0)} catch [Threading.AbandonedMutexException] {$downloadLocked=$true}
    if(-not $downloadLocked){throw '相同下载任务正在运行，请等待完成后再重试。'}
    $self = Get-Process -Id $PID
    $job | Add-Member pid $PID
    $job | Add-Member started ($self.StartTime.ToUniversalTime().ToString('o'))
    $job.state='running'; Write-VideoJson $JobPath $job
    if((Test-Path -LiteralPath ($JobPath+'.deleted')) -or (Test-Path -LiteralPath ($JobPath+'.paused'))){exit}
    if ($job.kind -eq 'gallery') {
        Invoke-GalleryDownload $job $JobPath ($base+'.out.log')
    } else {
    if($job.kind -eq 'files' -and @($job.arguments|Where-Object{$_ -like '--input-file=*'}).Count){. (Join-Path $PSScriptRoot 'transfer-probe.ps1');Import-TransferDefinition $job}
    $attempt=0
    do {
    $attempt++
    if($job.kind -eq 'files' -and $job.transferFiles){. (Join-Path $PSScriptRoot 'transfer-probe.ps1');Prepare-FileTransfer $job $JobPath}
    $engineArgs=@($job.arguments);$rpcPort=0;$rpcFailed=$false;$rpcMiss=0
    if($job.kind -eq 'files' -and [IO.Path]::GetFileName($job.engine) -eq 'aria2c.exe'){
        . (Join-Path $PSScriptRoot 'telemetry.ps1')
        $listener=New-Object Net.Sockets.TcpListener([Net.IPAddress]::Loopback,0)
        try{$listener.Start();$rpcPort=$listener.LocalEndpoint.Port}finally{$listener.Stop()}
        $rpcSecret=[Guid]::NewGuid().ToString('N')
        $engineArgs+=@('--enable-rpc=true','--rpc-listen-all=false','--rpc-allow-origin-all=false',('--rpc-listen-port='+$rpcPort),('--rpc-secret='+$rpcSecret),'--max-download-result=1000')
    }
    $launchEngine=$job.engine
    $customRanges=$job.kind -eq 'files' -and $job.transferMode -eq 'extreme' -and $job.probes -and -not @($job.probes|Where-Object{-not $_.rangeSupported -or $_.size -le 0}).Count -and -not @($job.expectedFiles|Where-Object{Test-Path -LiteralPath ($_+'.aria2')}).Count
    if($customRanges){
        $rpcPort=0;$launchEngine="$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe"
        $connections=if($attempt -eq 1){64}elseif($attempt -eq 2){4}else{1}
        $engineArgs=@('-NoProfile','-ExecutionPolicy','Bypass','-File',(Join-Path $PSScriptRoot 'range-worker.ps1'),'-JobPath',$JobPath,'-Connections',[string]$connections)
        $job|Add-Member phase ('分段下载：最多 '+$connections+' 个连接') -Force
    }
    $nextMetrics=Get-Date
    $proc = Start-VideoProcess $launchEngine $engineArgs ($base+'.out.log') ($base+'.error.log')
    $job | Add-Member -NotePropertyName childPid -NotePropertyValue $proc.Id -Force
    $job | Add-Member -NotePropertyName childStarted -NotePropertyValue $proc.StartTime.ToUniversalTime().ToString('o') -Force
    Write-VideoJson $JobPath $job
    while(-not $proc.WaitForExit(500)){
        if($rpcPort -and (Get-Date) -ge $nextMetrics){
            try{
                $sample=Update-DownloadMetrics $rpcPort $rpcSecret $base;$rpcMiss=0
                if($sample.finished){$rpcFailed=$sample.failed;Invoke-DownloadRpc $rpcPort $rpcSecret 'aria2.shutdown'|Out-Null}
            }catch{$rpcMiss++;if($rpcMiss -ge 10){Stop-DownloadTree $proc.Id;throw '无法读取下载引擎进度，任务已停止，可点击续传。'}}
            $nextMetrics=(Get-Date).AddSeconds(2)
        }

        if((Test-Path -LiteralPath ($JobPath+'.deleted')) -or (Test-Path -LiteralPath ($JobPath+'.paused'))){
            Stop-DownloadTree $proc.Id
            exit
        }
    }
    $proc.Refresh()
    if($proc.ExitCode -eq 0 -and -not $rpcFailed){$proc.Dispose();break}
    $failure=Get-DownloadFailure $base $proc.ExitCode
    $proc.Dispose()
    if($job.kind -ne 'files' -or $attempt -ge 3 -or -not ((Test-TransientDownloadFailure $failure) -or ($job.adaptive -and $failure -match 'errorCode=(2|5|6|8|22|24)\b|status=403|status=429|\(403\)|\(429\)|503|too slow|Timeout'))){throw $failure}
    if($job.adaptive -and $attempt -eq 1){$job.arguments=@($job.arguments|Where-Object{$_ -notmatch '^--(split|max-connection-per-server|lowest-speed-limit)='})+@('--split=4','--max-connection-per-server=4');$job|Add-Member recoveryNote '网络不稳定，已降低并发并刷新原始下载链接重试。' -Force}
    elseif($job.adaptive -and $attempt -eq 2){$job.arguments=@($job.arguments|Where-Object{$_ -notmatch '^--(split|max-connection-per-server)='})+@('--split=1','--max-connection-per-server=1');$job|Add-Member recoveryNote '已切换到单连接兼容重试。' -Force}
    $job|Add-Member retryAttempt $attempt -Force
    Write-VideoJson $JobPath $job
    for($wait=0;$wait -lt (4*$attempt);$wait++){
        if((Test-Path -LiteralPath ($JobPath+'.deleted')) -or (Test-Path -LiteralPath ($JobPath+'.paused'))){exit}
        Start-Sleep -Milliseconds 500
    }
    }while($true)

    if($job.kind -eq 'files'){
        for($i=0;$i -lt $job.expectedFiles.Count;$i++){
            $path=$job.expectedFiles[$i]
            if(-not (Test-Path -LiteralPath $path -PathType Leaf) -or (Test-Path -LiteralPath ($path+'.aria2'))){throw '下载未完成，请继续下载。'}
            if($job.expectedSizes[$i] -gt 0 -and (Get-Item -LiteralPath $path).Length -ne $job.expectedSizes[$i]){throw '下载文件大小不匹配，请重试。'}
        }
        $job.file=$job.expectedFiles[0]
        $job|Add-Member validation $(if(@($job.transferFiles|Where-Object{$_.sha256}).Count){'大小检查通过；带 SHA-256 的文件由下载引擎完成校验。'}else{'文件存在且大小检查通过；源站未提供哈希时不宣称完成哈希校验。'}) -Force
    }else{
    $job.file = @(Get-Content -LiteralPath ($base+'.out.log') -Encoding UTF8 | Where-Object { $_ -match '^[a-zA-Z]:[\\/]' } | Select-Object -Last 1) -join ''
    if (-not $job.file -or -not (Test-Path -LiteralPath $job.file)) { throw '下载引擎结束，但未找到输出视频，请查看任务日志。' }
    if($job.ffprobe -and (Test-Path -LiteralPath $job.ffprobe)){
        $job|Add-Member phase '验证合并后的媒体文件' -Force;Write-VideoJson $JobPath $job
        $verify=Start-VideoProcess $job.ffprobe @('-v','error','-show_entries','stream=codec_type:format=duration','-of','json',$job.file) ($base+'.verify.json') ($base+'.verify.error')
        $job.childPid=$verify.Id;$job.childStarted=$verify.StartTime.ToUniversalTime().ToString('o');Write-VideoJson $JobPath $job
        if(-not $verify.WaitForExit(30000)){$verify.Kill();throw '媒体完整性检查超时，可重试。'};$verify.Refresh()
        if($verify.ExitCode -ne 0){throw '合并后媒体无法读取，请重试下载。'}
        $media=Read-VideoJson ($base+'.verify.json');$verify.Dispose()
        $track=if($job.mediaMode -eq 'audio'){'audio'}else{'video'}
        if(-not @($media.streams|Where-Object{$_.codec_type -eq $track}).Count){throw '输出文件缺少所选媒体轨道。'}
        $job|Add-Member validation ('FFprobe 已确认文件可读取，包含 '+$track+' 轨道。') -Force
    }

    }
    }
    if($job.companion){
        try{Write-VideoCompanionFiles $job $JobPath}
        catch{$job.companion.status='partial';$job.companion.errors=@($_.Exception.Message)}
        Write-VideoJson $JobPath $job
    }
    $job.state='completed'
} catch { $job.state='failed'; $job.error=$_.Exception.Message; $failure=New-RecoveryError -Message $job.error -Code $_.Exception.Data['code']; foreach($key in @('code','retryable','details')){$job|Add-Member -NotePropertyName $key -NotePropertyValue $failure[$key] -Force} }
finally {if($downloadLocked){$downloadMutex.ReleaseMutex()};if($downloadMutex){$downloadMutex.Dispose()}}
if(-not (Test-Path -LiteralPath ($JobPath+'.deleted')) -and -not (Test-Path -LiteralPath ($JobPath+'.paused'))){Write-VideoJson $JobPath $job}

if($job.state -eq 'completed' -and (Test-Path -LiteralPath (Join-Path $PSScriptRoot 'library.ps1'))){
    try {
        . (Join-Path $PSScriptRoot 'library.ps1')
        $libraryConfig=Read-VideoJson (Join-Path $PSScriptRoot 'config.json')
        $indexed=Invoke-LibraryAction ([pscustomobject]@{action='library-snapshot';id=[IO.Path]::GetFileNameWithoutExtension($JobPath)}) $libraryConfig.directory
        if(-not $indexed.ok -or -not $indexed.snapshotted){throw '资料库未能建立下载索引。'}
        if($job.companion){$job|Add-Member -NotePropertyName libraryWarning -NotePropertyValue '' -Force}
    } catch {if($job.companion){$job|Add-Member -NotePropertyName libraryWarning -NotePropertyValue ('资料库索引未更新：'+$_.Exception.Message) -Force}} # Media and sidecar files remain complete.
    if($job.companion -and -not (Test-Path -LiteralPath ($JobPath+'.deleted'))){Write-VideoJson $JobPath $job}
}
Invoke-DownloadQueue
