function Get-TransferProbe([string]$url){
    $uri=$null
    if(-not [Uri]::TryCreate($url,[UriKind]::Absolute,[ref]$uri) -or $uri.Scheme -notin @('https','http') -or $uri.UserInfo -or $url -match '[\r\n]'){throw '请填写有效的 HTTP/HTTPS 下载链接。'}
    [Net.ServicePointManager]::SecurityProtocol=[Net.SecurityProtocolType]::Tls12
    $request=[Net.HttpWebRequest]::Create($uri);if($uri.IsLoopback){$request.Proxy=$null};$request.Method='GET';$request.AddRange(0,0);$request.Timeout=15000;$request.ReadWriteTimeout=15000;$request.AllowAutoRedirect=$true;$request.MaximumAutomaticRedirections=10;$request.UserAgent='JingcaiDownloader/1.19';$request.KeepAlive=$false
    $response=$null
    try{
        try{$response=$request.GetResponse()}catch [Net.WebException]{
            if($_.Exception.Response -and [int]$_.Exception.Response.StatusCode -eq 416 -and $_.Exception.Response.Headers['Content-Range'] -eq 'bytes */0'){$response=$_.Exception.Response}
            else{if($_.Exception.Response){$_.Exception.Response.Dispose()};throw}
        }
        [long]$size=0;$range=$false;$known=$false
        if([int]$response.StatusCode -eq 206 -and $response.Headers['Content-Range'] -match '^bytes 0-0/([0-9]+)$'){$size=[long]$Matches[1];$range=$true;$known=$true}
        elseif([int]$response.StatusCode -eq 200 -and $response.ContentLength -ge 0){$size=[long]$response.ContentLength;$known=$true}
        elseif([int]$response.StatusCode -eq 416){$known=$true}
        $filename='';$disposition=[string]$response.Headers['Content-Disposition']
        if($disposition -match "filename\*\s*=\s*UTF-8''([^;]+)"){$filename=[Uri]::UnescapeDataString($Matches[1].Trim('"'))}
        elseif($disposition){try{$filename=(New-Object Net.Mime.ContentDisposition($disposition)).FileName}catch{}}
        if(-not $filename){$filename=[Uri]::UnescapeDataString([IO.Path]::GetFileName($response.ResponseUri.AbsolutePath))}
        return @{ok=$true;size=$size;sizeKnown=$known;rangeSupported=$range;filename=$filename;contentType=$response.ContentType;etag=[string]$response.Headers['ETag'];lastModified=[string]$response.Headers['Last-Modified'];host=$response.ResponseUri.Host;redirected=($response.ResponseUri.AbsoluteUri -ne $uri.AbsoluteUri)}
    }finally{if($response){$response.Dispose()};$request.Abort()}
}
function Import-TransferDefinition($job){
    if($job.transferFiles){return}
    $arg=@($job.arguments|Where-Object{$_ -like '--input-file=*'})|Select-Object -First 1
    if(-not $arg){return}
    $files=@()
    foreach($line in [IO.File]::ReadLines($arg.Substring(13))){
        if($line -match '^https?://'){
            $i=$files.Count
            $files+=@{url=$line;size=$(if($i -lt $job.expectedSizes.Count){[long]$job.expectedSizes[$i]}else{0});sha256='';name=$(if($i -lt $job.expectedFiles.Count){[IO.Path]::GetFileName($job.expectedFiles[$i])}else{''})}
        }elseif($files.Count -and $line -match '^\s+checksum=sha-256=([a-fA-F0-9]{64})$'){$files[-1].sha256=$Matches[1]}
    }
    if($files.Count -ne $job.expectedFiles.Count){throw '旧任务文件清单与输出路径不匹配，请重新获取链接。'}
    $job|Add-Member transferFiles $files -Force
    if(-not $job.PSObject.Properties['adaptive']){$job|Add-Member adaptive $true}
}
function Prepare-FileTransfer($job,[string]$jobPath){
    if(-not $job.transferFiles){return}
    $job|Add-Member phase '探测文件与分段支持' -Force;Write-VideoJson $jobPath $job
    $lines=@();$sizes=@();[long]$remaining=0;$probes=@();$index=0
    foreach($file in @($job.transferFiles)){
        if((Test-Path -LiteralPath ($jobPath+'.deleted')) -or (Test-Path -LiteralPath ($jobPath+'.paused'))){throw '任务已停止。'}
        $path=[IO.Path]::GetFullPath([string]$job.expectedFiles[$index]);$root=[IO.Path]::GetFullPath([string]$job.directory).TrimEnd('\')+'\'
        if(-not $path.StartsWith($root,[StringComparison]::OrdinalIgnoreCase)){throw '下载路径超出任务目录。'}
        $url=[string]$file.url
        if(([Uri]$url).Host -eq 'huggingface.co'){$url=$url.Split('?')[0]+'?download=true&jc_refresh='+[DateTimeOffset]::UtcNow.ToUnixTimeSeconds()}
        $probe=$null
        try{$probe=Get-TransferProbe $url}catch{$probe=@{ok=$false;rangeSupported=$null;sizeKnown=$false;size=0;error=$_.Exception.Message}}
        if($probe.ok -and $probe.contentType -like 'text/html*' -and [IO.Path]::GetExtension($path) -notin @('.html','.htm')){throw '服务器返回的是网页而非文件，请检查下载直链或登录状态。'}
        [long]$size=$file.size
        if($probe.ok -and $probe.sizeKnown){
            if($size -gt 0 -and $size -ne $probe.size){throw '源文件大小已变化，停止下载以免混合不同版本。请重新获取文件清单。'}
            $size=[long]$probe.size
        }
        $previous=if($job.probes -and $index -lt $job.probes.Count){$job.probes[$index]}else{$null}
        if((Test-Path -LiteralPath $path) -and (Get-Item -LiteralPath $path).Length -gt 0 -and $previous -and $probe.ok){
            if(($previous.etag -and $probe.etag -and $previous.etag -cne $probe.etag) -or ($previous.sizeKnown -and $probe.sizeKnown -and $previous.size -ne $probe.size)){throw '源文件版本已变化。已保留原文件；请更换文件名后重新下载。'}
        }
        $lines+=$url;$lines+=' dir='+[IO.Path]::GetDirectoryName($path);$lines+=' out='+[IO.Path]::GetFileName($path)
        if($file.sha256){$lines+=' checksum=sha-256='+$file.sha256}
        if($probe.ok -and -not $probe.rangeSupported){
            $lines+=' split=1';$lines+=' max-connection-per-server=1'
            if((Test-Path -LiteralPath ($path+'.aria2')) -or ((Test-Path -LiteralPath $path) -and ($size -eq 0 -or (Get-Item -LiteralPath $path).Length -ne $size))){
                $suffix='.partial-backup-'+[Guid]::NewGuid().ToString('N').Substring(0,8)
                foreach($part in @($path,($path+'.aria2'))){if(Test-Path -LiteralPath $part){Move-Item -LiteralPath $part -Destination ($part+$suffix)}}
                $job|Add-Member recoveryNote '服务器不支持续传，已保留旧片段备份并从头使用单连接下载。' -Force
            }
        }
        [long]$existing=0;if(Test-Path -LiteralPath $path){$existing=(Get-Item -LiteralPath $path).Length}
        $remaining+=[Math]::Max([long]0,($size-$existing));$sizes+=$size;$probes+=$probe;$index++
        $job.phase='探测文件 '+$index+'/'+$job.transferFiles.Count;Write-VideoJson $jobPath $job
    }
    $drive=New-Object IO.DriveInfo([IO.Path]::GetPathRoot($job.directory))
    if($drive.AvailableFreeSpace -lt $remaining){throw '剩余磁盘空间不足，请更换目录或减少文件。'}
    if($drive.DriveFormat -eq 'FAT32' -and @($sizes|Where-Object{$_ -ge 4294967295}).Count){throw 'FAT32 不能保存超过 4 GB 的单文件。'}
    $inputArg=@($job.arguments|Where-Object{$_ -like '--input-file=*'})[0]
    if(-not $inputArg){throw '任务缺少文件清单。'}
    [IO.File]::WriteAllLines($inputArg.Substring(13),[string[]]$lines,(New-Object Text.UTF8Encoding($false)))
    $job.expectedSizes=$sizes;$job|Add-Member probes $probes -Force;$job.phase='下载中';Write-VideoJson $jobPath $job
}
