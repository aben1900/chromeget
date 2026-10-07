function Assert-TransferPath([string]$name) {
    if(-not $name -or $name.Length -gt 180 -or $name -match '[\\\x00-\x1f:<>"|?*]' -or $name.StartsWith('/')){throw '文件名不能安全地保存到 Windows。'}
    foreach($part in $name.Split('/')){if(-not $part -or $part -in @('.','..') -or $part -match '[ .]$|^(?i:CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\.|$)'){throw '文件路径包含不支持的名称。'}}
    return $name
}
function Get-TransferTuning($settings) {
    if($settings.transferMode -eq 'extreme'){return @('--split=64','--max-connection-per-server=16','--max-concurrent-downloads=2')}
    if($settings.transferMode -eq 'compatible'){return @('--split=1','--max-connection-per-server=1','--max-concurrent-downloads=1')}
    if($settings.transferMode -eq 'balanced'){return @('--split=4','--max-connection-per-server=4','--max-concurrent-downloads=2')}
    return @('--split=32','--max-connection-per-server=16','--max-concurrent-downloads=2')
}
function Invoke-TransferAction($message,$settings) {
    if($message.action -eq 'video-file-probe'){. (Join-Path $PSScriptRoot 'transfer-probe.ps1');return Get-TransferProbe ([string]$message.url)}
    if($message.action -eq 'video-transfer-settings'){
        if($message.transferMode -notin @('extreme','fast','balanced','compatible')){throw '无效的下载档位。'}
        $settings|Add-Member transferMode $message.transferMode -Force
        if($null -ne $message.maxActive){if([int]$message.maxActive -lt 1 -or [int]$message.maxActive -gt 8){throw '同时下载任务数应为 1–8。'};$settings|Add-Member maxActive ([int]$message.maxActive) -Force}
        if($null -ne $message.autoClassify){$settings|Add-Member autoClassify ([bool]$message.autoClassify) -Force}
        if($null -ne $message.adaptive){$settings|Add-Member adaptive ([bool]$message.adaptive) -Force}
        Write-VideoJson (Join-Path $PSScriptRoot 'video-settings.json') $settings
        Invoke-DownloadQueue
        return @{ok=$true;transferMode=$settings.transferMode}
    }
    $jobs=Join-Path $PSScriptRoot 'video-jobs';[IO.Directory]::CreateDirectory($jobs)|Out-Null
    if($message.action -eq 'video-hf-info'){
        $uri=$null
        if(-not [Uri]::TryCreate([string]$message.url,[UriKind]::Absolute,[ref]$uri) -or $uri.Scheme -ne 'https' -or $uri.Host -ne 'huggingface.co' -or $uri.UserInfo -or $uri.Port -ne 443){throw '请填写 Hugging Face 模型仓库或文件的 HTTPS 网址。'}
        $parts=$uri.AbsolutePath.Trim('/').Split('/')
        if($parts.Count -lt 2 -or $parts[0] -notmatch '^[A-Za-z0-9_-]+$' -or $parts[1] -notmatch '^[A-Za-z0-9_.-]+$'){throw '请使用 owner/model 模型仓库网址。'}
        $repo=$parts[0]+'/'+$parts[1];$revision='main';$only=''
        if($parts.Count -gt 2){
            if($parts.Count -lt 4 -or $parts[2] -notin @('blob','resolve','tree')){throw '请使用仓库、blob 或 resolve 文件网址。'}
            $revision=[Uri]::UnescapeDataString($parts[3])
            if($parts.Count -gt 4){$only=[Uri]::UnescapeDataString(($parts[4..($parts.Count-1)] -join '/'))}
            if($parts[2] -eq 'tree' -and $only){throw '请打开仓库根目录或单个文件。'}
        }
        [Net.ServicePointManager]::SecurityProtocol=[Net.SecurityProtocolType]::Tls12
        try {$info=Invoke-RestMethod -Uri ('https://huggingface.co/api/models/'+$repo+'/revision/'+[Uri]::EscapeDataString($revision)+'?blobs=true') -TimeoutSec 45}
        catch{throw '无法读取公开模型仓库。请检查网络和网址；私有或需授权的仓库暂不支持。'}
        if($info.sha -notmatch '^[a-f0-9]{40}$'){throw '仓库没有有效的版本信息。'}
        $files=@();[long]$total=0
        foreach($entry in @($info.siblings)){
            if($only -and $entry.rfilename -cne $only){continue}
            $name=Assert-TransferPath ([string]$entry.rfilename)
            $hash=if($entry.lfs.sha256 -match '^[a-fA-F0-9]{64}$'){[string]$entry.lfs.sha256}else{''}
            [long]$size=$entry.size;if($size -lt 0){throw '文件大小无效。'}
            $url='https://huggingface.co/'+$repo+'/resolve/'+$info.sha+'/'+((@($name.Split('/')|ForEach-Object{[Uri]::EscapeDataString($_)})) -join '/')
            $files+=@{index=$files.Count;name=$name;size=$size;sha256=$hash;url=$url};$total+=$size
        }
        if(-not $files.Count -or $files.Count -gt 1000){throw '没有匹配文件，或仓库超过 1000 个文件；请使用单个文件网址。'}
        $id=[Guid]::NewGuid().ToString('N')
        $draft=@{files=$files;source=$uri.AbsoluteUri;folder=('[HF] '+$repo.Replace('/','--')+' '+$info.sha.Substring(0,12));title=('[Hugging Face] '+$repo);createdAt=(Get-Date).ToUniversalTime().ToString('o')}
        Write-VideoJson (Join-Path $jobs ($id+'.files.json')) $draft
        return @{ok=$true;draftId=$id;files=@($files|ForEach-Object{@{index=$_.index;name=$_.name;size=$_.size}});totalBytes=$total;title=$draft.title;revision=$info.sha}
    }
    if($message.confirmed -ne $true){throw '请确认需要下载的文件。'}
    $aria=Join-Path $PSScriptRoot 'bin\aria2c.exe'
    if(-not (Test-Path -LiteralPath $aria)){throw '缺少 aria2，请更新本地程序。'}
    if($message.draftId){
        if($message.draftId -notmatch '^[a-f0-9]{32}$'){throw '文件清单无效。'}
        $draft=Read-VideoJson (Join-Path $jobs ($message.draftId+'.files.json'))
        $indexes=@($message.selectedIndexes|Sort-Object -Unique)
        if(-not $indexes.Count){throw '请至少选择一个文件。'}
        $files=@();foreach($index in $indexes){if([string]$index -notmatch '^\d+$' -or [int]$index -ge $draft.files.Count){throw '文件选择无效。'};$files+= $draft.files[[int]$index]}
        $modelRoot=if($settings.autoClassify){Join-Path $settings.directory '模型'}else{$settings.directory};$directory=Join-Path $modelRoot $draft.folder;$title=$draft.title;$source=$draft.source;$site='Hugging Face'
    }else{
        $uri=$null
        if(-not [Uri]::TryCreate([string]$message.url,[UriKind]::Absolute,[ref]$uri) -or $uri.Scheme -notin @('http','https') -or $uri.UserInfo -or $message.url -match '[\r\n]'){throw '媒体地址无效。'}
        $ext=[IO.Path]::GetExtension($uri.AbsolutePath).ToLowerInvariant()
        if($ext -notin @('.mp4','.webm','.m4a','.mp3','.ogg','.mov','.wav')){$ext=if($message.mediaType -like 'audio/*'){'.m4a'}else{'.mp4'}}
        $sha=[Security.Cryptography.SHA256]::Create();try{$key=[BitConverter]::ToString($sha.ComputeHash([Text.Encoding]::UTF8.GetBytes($uri.AbsoluteUri))).Replace('-','').Substring(0,12)}finally{$sha.Dispose()}
        $name=([regex]::Replace([string]$message.title,'[\x00-\x1f\\/:*?"<>|]','_')).Trim(' ','.');if(-not $name){$name='媒体'};if($name.Length -gt 65){$name=$name.Substring(0,65)}
        if($message.genericFile){
            $original=if($message.filename){[string]$message.filename}else{[Uri]::UnescapeDataString([IO.Path]::GetFileName($uri.AbsolutePath))}
            if(-not $original){$original='download.bin'}
            $original=Assert-TransferPath $original
            if($original.Contains('/')){throw '文件名不能包含目录。'}
            $extension=[IO.Path]::GetExtension($original);$stem=[IO.Path]::GetFileNameWithoutExtension($original)
            $name=Assert-TransferPath ($stem+' ['+$key+']'+$extension)
        }else{$name=Assert-TransferPath ('[媒体] '+$name+' '+$key+$ext)}
        if($message.checksum -and [string]$message.checksum -notmatch '^[a-fA-F0-9]{64}$'){throw 'SHA-256 应为 64 位十六进制字符。'}
        $files=@(@{name=$name;size=0;url=$uri.AbsoluteUri;sha256=([string]$message.checksum)})
        $directory=if($settings.autoClassify){Join-Path $settings.directory (Get-DownloadCategory $name)}else{$settings.directory};$title=$name;$source=$uri.AbsoluteUri;$site=$uri.Host
    }
    [IO.Directory]::CreateDirectory($directory)|Out-Null
    $expected=@();[long]$remaining=0;$lines=@()
    foreach($file in $files){
        $name=Assert-TransferPath $file.name;$path=Join-Path $directory $name.Replace('/','\');$expected+=$path
        if($path.Length -gt 240){throw '保存路径太长，请选择更短的目录。'}
        [long]$existing=0;if(Test-Path -LiteralPath $path){$existing=(Get-Item -LiteralPath $path).Length}
        $remaining += [Math]::Max([long]0,([long]$file.size-$existing))
        $lines+=[string]$file.url;$lines+=' dir='+[IO.Path]::GetDirectoryName($path);$lines+=' out='+[IO.Path]::GetFileName($path)
        if($file.sha256){$lines+=' checksum=sha-256='+$file.sha256}
    }
    $drive=New-Object IO.DriveInfo([IO.Path]::GetPathRoot($directory))
    if($drive.AvailableFreeSpace -lt $remaining){throw '保存目录剩余空间不足，请更换目录或减少所选文件。'}
    if($drive.DriveFormat -eq 'FAT32' -and @($files|Where-Object{[long]$_.size -ge 4294967295}).Count){throw 'FAT32 无法保存超过 4 GB 的文件，请选择 NTFS 或 exFAT 目录。'}
    $id=[Guid]::NewGuid().ToString('N');$jobPath=Join-Path $jobs ($id+'.json');$input=Join-Path $jobs ($id+'.aria2.txt')
    $arguments=@(('--input-file='+$input),'--continue=true','--auto-file-renaming=false','--allow-overwrite=false','--file-allocation=none','--check-integrity=true','--min-split-size=1M','--summary-interval=5','--console-log-level=notice','--enable-color=false','--download-result=full','--max-tries=8','--retry-wait=3','--connect-timeout=20','--timeout=45','--auto-save-interval=5')+@(Get-TransferTuning $settings)
    # aria2 does not automatically read Windows Internet Options, unlike the metadata client.
    $targetUri=[Uri]$files[0].url
    $proxy=[Net.WebRequest]::DefaultWebProxy.GetProxy($targetUri)
    if(-not $targetUri.IsLoopback -and $proxy -and $proxy.AbsoluteUri -ne $targetUri.AbsoluteUri -and $proxy.Scheme -in @('http','https') -and -not $proxy.UserInfo){$arguments+=('--all-proxy='+$proxy.AbsoluteUri)}
    if($settings.adaptive -ne $false){$arguments+=@('--lowest-speed-limit=1K','--max-resume-failure-tries=0')}
    $job=@{transferMode=$settings.transferMode;transferFiles=$files;adaptive=($settings.adaptive -ne $false);createdAt=(Get-Date).ToUniversalTime().ToString('o');kind='files';state='starting';directory=$directory;arguments=$arguments;engine=$aria;error='';file='';siteName=$site;title=$title;source=$source;expectedFiles=$expected;expectedSizes=@($files|ForEach-Object{[long]$_.size})}
    # Overlapping selections must not write to the same output simultaneously.
    foreach($entry in @(Get-ChildItem -LiteralPath $jobs -Filter '*.json' -File|Where-Object{$_.BaseName -match '^[a-f0-9]{32}$'})){
        if(Test-Path -LiteralPath ($entry.FullName+'.deleted')){continue}
        $other=Read-VideoJson $entry.FullName
        if($other.kind -eq 'files' -and @($other.expectedFiles|Where-Object{$_ -in $expected}).Count){
            $state=Invoke-VideoActionCore ([pscustomobject]@{action='video-job';id=$entry.BaseName})
            if($state.state -in @('queued','starting','running')){
                if(@($expected|Where-Object{$_ -notin $other.expectedFiles}).Count){throw '部分文件已在其他任务中下载，请等待完成，或取消勾选正在下载的文件。'}
                return @{ok=$true;id=$entry.BaseName;directory=$other.directory;reused=$true}
            }
        }
    }
    $existing=Find-ExistingDownload $jobs $job $false
    if($existing){return Invoke-VideoActionCore ([pscustomobject]@{action='video-resume';id=$existing})}
    [IO.File]::WriteAllLines($input,[string[]]$lines,(New-Object Text.UTF8Encoding($false)))
    Write-VideoJson $jobPath $job
    Submit-DownloadJob $jobPath
    return @{ok=$true;id=$id;directory=$directory}
}
