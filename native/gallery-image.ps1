function Assert-GalleryPublicAddress([Net.IPAddress]$address) {
    if($address.IsIPv4MappedToIPv6){$address=$address.MapToIPv4()}
    $b=$address.GetAddressBytes()
    if($b.Length -eq 4){
        if($b[0] -eq 0 -or $b[0] -eq 10 -or $b[0] -eq 127 -or $b[0] -ge 224 -or ($b[0] -eq 169 -and $b[1] -eq 254) -or ($b[0] -eq 172 -and $b[1] -ge 16 -and $b[1] -le 31) -or ($b[0] -eq 192 -and $b[1] -eq 168) -or ($b[0] -eq 100 -and $b[1] -ge 64 -and $b[1] -le 127) -or ($b[0] -eq 192 -and $b[1] -eq 0) -or ($b[0] -eq 198 -and $b[1] -in @(18,19,51)) -or ($b[0] -eq 203 -and $b[1] -eq 0 -and $b[2] -eq 113)){throw '不允许访问本机、内网或保留网络地址。'}
    }elseif($b[0] -lt 0x20 -or $b[0] -gt 0x3f -or ($b[0] -eq 0x20 -and $b[1] -eq 0x01 -and $b[2] -in @(0,0x0d)) -or ($b[0] -eq 0x20 -and $b[1] -eq 0x02)){throw '不允许访问本机、内网或保留网络地址。'}
}
function Assert-GalleryWebUrl([string]$url,[bool]$resolveDns=$false) {
    $uri=$null
    if(-not [Uri]::TryCreate($url,[UriKind]::Absolute,[ref]$uri) -or $uri.Scheme -notin @('http','https') -or -not $uri.IsDefaultPort -or $uri.UserInfo -or $url.Length -gt 8192){throw '网页图片地址无效。'}
    $hostName=$uri.DnsSafeHost.TrimEnd('.').ToLowerInvariant();$ip=$null
    if([Net.IPAddress]::TryParse($hostName.Trim('[',']'),[ref]$ip)){Assert-GalleryPublicAddress $ip}
    elseif($hostName -notmatch '\.' -or $hostName -match '(^|\.)(localhost|local|internal|lan|home|test|invalid|onion)$'){throw '不允许访问本机或内网地址。'}
    if($resolveDns){
        $task=[Net.Dns]::GetHostAddressesAsync($hostName)
        if(-not $task.Wait(5000)){throw '图片域名解析超时。'}
        $addresses=@($task.GetAwaiter().GetResult())
        if($addresses.Count -eq 0){throw '图片域名无法解析。'}
        foreach($address in $addresses){Assert-GalleryPublicAddress $address}
    }
    return $uri.AbsoluteUri
}
function Read-GalleryDraft($message,[string]$jobs) {
    if($message.draftId -notmatch '^[a-f0-9]{32}$'){throw '图集预览编号无效。'}
    $draft=Read-VideoJson (Join-Path $jobs ($message.draftId+'.gallery.json'))
    if(@($draft.images).Count -lt 1 -or @($draft.images).Count -gt 100){throw '图集图片数量无效。'}
    if([DateTime]::Parse($draft.created).ToUniversalTime().AddMinutes(30) -lt (Get-Date).ToUniversalTime()){throw '图片链接可能已过期，请重新获取图集后确认。'}
    foreach($item in $draft.images){$null=Assert-GalleryImage $item.url $draft.sourceKind}
    return $draft
}
function Save-WebGalleryPreview($message,$jobs,$directory) {
    $url=Assert-GalleryWebUrl ([string]$message.url)
    if(@($message.images).Count -gt 100){throw '每次最多获取 100 张网页图片。'}
    $seen=@{};$images=@(foreach($item in @($message.images)){
        try{$imageUrl=Assert-GalleryWebUrl ([string]$item.url)}catch{continue}
        if($seen.ContainsKey($imageUrl)){continue};$seen[$imageUrl]=$true
        $width=0;$height=0
        if([int]::TryParse([string]$item.width,[ref]$width)){$width=[Math]::Min(100000,[Math]::Max(0,$width))}
        if([int]::TryParse([string]$item.height,[ref]$height)){$height=[Math]::Min(100000,[Math]::Max(0,$height))}
        [pscustomobject]@{url=$imageUrl;width=$width;height=$height}
    })
    if($images.Count -eq 0){throw '当前网页未找到可下载的公开图片。'}
    $hash=[Security.Cryptography.SHA256]::Create()
    try{$noteId=([BitConverter]::ToString($hash.ComputeHash([Text.Encoding]::UTF8.GetBytes((ConvertTo-Json -InputObject @($url,@($images|ForEach-Object{$_.url})) -Compress -Depth 4))))).Replace('-','').Substring(0,16).ToLowerInvariant()}finally{$hash.Dispose()}
    $title=([string]$message.title);if($title.Length -gt 300){$title=$title.Substring(0,300)}
    $siteName=([Uri]$url).DnsSafeHost;$id=[Guid]::NewGuid().ToString('N')
    Write-VideoJson (Join-Path $jobs ($id+'.gallery.json')) @{title=$title;noteId=$noteId;url=$url;images=$images;created=(Get-Date).ToUniversalTime().ToString('o');sourceKind='webpage';siteName=$siteName}
    return @{ok=$true;kind='gallery';draftId=$id;title=$title;images=$images;directory=$directory;heights=@();sourceKind='webpage';siteName=$siteName}
}
function Resolve-GallerySystemProxy([string]$url,$settings) {
    if($settings.ProxyEnable -ne 1 -or -not $settings.ProxyServer){return ''}
    $uri=[Uri]$url
    foreach($pattern in @(([string]$settings.ProxyOverride) -split ';')){
        $pattern=$pattern.Trim()
        if(-not $pattern){continue}
        if(($pattern -eq '<local>' -and $uri.DnsSafeHost -notmatch '\.') -or $uri.DnsSafeHost -like $pattern){return ''}
    }
    $server=[string]$settings.ProxyServer
    if($server.Contains('=')){
        $mapping=@{};foreach($entry in $server -split ';'){$pair=$entry -split '=',2;if($pair.Count -eq 2){$mapping[$pair[0].Trim()]=$pair[1].Trim()}}
        $server=[string]$mapping[$uri.Scheme];if(-not $server){return ''}
    }
    if($server -notmatch '^https?://'){$server='http://'+$server}
    $proxy=$null
    if(-not [Uri]::TryCreate($server,[UriKind]::Absolute,[ref]$proxy) -or $proxy.Scheme -notin @('http','https') -or $proxy.UserInfo){throw '系统代理配置不受支持。'}
    return $proxy.AbsoluteUri
}
function Invoke-GalleryNetwork([string]$url,[string]$sourceKind,[string]$method,[string]$destination='') {
    $proxySettings=Get-ItemProperty -LiteralPath 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Internet Settings' -ErrorAction SilentlyContinue
    $proxyUrl=Resolve-GallerySystemProxy $url $proxySettings
    $process=New-Object Diagnostics.Process
    $process.StartInfo.FileName=Join-Path $PSScriptRoot 'bin\node.exe'
    $process.StartInfo.Arguments=Quote-VideoArg (Join-Path $PSScriptRoot 'gallery-http.cjs')
    $process.StartInfo.UseShellExecute=$false;$process.StartInfo.CreateNoWindow=$true
    $process.StartInfo.RedirectStandardInput=$true;$process.StartInfo.RedirectStandardOutput=$true;$process.StartInfo.RedirectStandardError=$true
    $process.StartInfo.StandardOutputEncoding=New-Object Text.UTF8Encoding($false)
    try{
        $null=$process.Start();$stdout=$process.StandardOutput.ReadToEndAsync();$stderr=$process.StandardError.ReadToEndAsync()
        $payload=[Text.Encoding]::UTF8.GetBytes((ConvertTo-Json -InputObject @{url=$url;sourceKind=$sourceKind;method=$method;destination=$destination;proxyUrl=$proxyUrl} -Compress))
        $process.StandardInput.BaseStream.Write($payload,0,$payload.Length);$process.StandardInput.Close()
        $timeout=if($method -eq 'HEAD'){12000}else{65000}
        if(-not $process.WaitForExit($timeout)){try{$process.Kill()}catch{};throw '图片网络请求超时。'}
        $process.WaitForExit();$result=$stdout.GetAwaiter().GetResult()|ConvertFrom-Json
        if(-not $result.ok){throw $(if($result.error){$result.error}else{'图片网络请求失败。'})}
        return $result
    }finally{$process.Dispose()}
}
function Invoke-GalleryRequest($client,[string]$url,[string]$method,[string]$sourceKind) {
    $seen=@{}
    for($hop=0;$hop -le 5;$hop++){
        $url=Assert-GalleryImage $url $sourceKind $true
        if($seen.ContainsKey($url)){throw '图片地址发生循环跳转。'};$seen[$url]=$true
        if($method -eq 'HEAD'){
            $request=New-Object Net.Http.HttpRequestMessage([Net.Http.HttpMethod]::Head,$url)
            try{$response=$client.SendAsync($request,[Net.Http.HttpCompletionOption]::ResponseHeadersRead).GetAwaiter().GetResult()}finally{$request.Dispose()}
        }else{$response=$client.GetAsync($url,[Net.Http.HttpCompletionOption]::ResponseHeadersRead).GetAwaiter().GetResult()}
        if([int]$response.StatusCode -notin @(301,302,303,307,308)){return $response}
        try{
            if($hop -eq 5 -or -not $response.Headers.Location){throw '图片跳转次数过多或地址无效。'}
            $url=([Uri]::new([Uri]$url,[string]$response.Headers.Location)).AbsoluteUri
        }finally{$response.Dispose()}
    }
}
function Invoke-GalleryHead([string]$url,[string]$sourceKind) {
    if($sourceKind -eq 'webpage'){return Invoke-GalleryNetwork $url $sourceKind 'HEAD'}
    Add-Type -AssemblyName System.Net.Http
    $handler=New-Object Net.Http.HttpClientHandler
    $handler.AllowAutoRedirect=$false;$handler.UseCookies=$false;$handler.UseDefaultCredentials=$false
    $client=New-Object Net.Http.HttpClient($handler);$client.Timeout=[TimeSpan]::FromSeconds(8)
    $response=$null
    try{
        $response=Invoke-GalleryRequest $client $url 'HEAD' $sourceKind
        $null=$response.EnsureSuccessStatusCode()
        $type=[string]$response.Content.Headers.ContentType.MediaType
        $format=switch($type.ToLowerInvariant()){'image/jpeg'{'jpeg'}'image/png'{'png'}'image/webp'{'webp'}'image/gif'{'gif'}default{''}}
        $bytes=$response.Content.Headers.ContentLength
        if($null -eq $bytes -or $bytes -lt 0){$bytes=$null}
        return @{format=$format;bytes=$bytes}
    }finally{if($response){$response.Dispose()};$client.Dispose();$handler.Dispose()}
}
function Get-GalleryImageInfo($message,[string]$jobs) {
    $draft=Read-GalleryDraft $message $jobs;$index=$message.index
    if(($index -isnot [int] -and $index -isnot [long]) -or $index -lt 0 -or $index -ge @($draft.images).Count){throw '图片编号无效。'}
    $item=$draft.images[$index]
    $url=Assert-GalleryImage $item.url $draft.sourceKind
    $metadata=@{format='';bytes=$null}
    try{$metadata=Invoke-GalleryHead $url $draft.sourceKind}catch{}
    return @{ok=$true;format=$metadata.format;bytes=$metadata.bytes;width=$item.width;height=$item.height}
}
function Get-GalleryImageFormat($format) {
    if($null -eq $format -or [string]$format -eq ''){return 'original'}
    if([string]$format -cnotin @('original','jpeg','png','webp')){throw '图片格式必须为原图、JPEG、PNG 或 WEBP。'}
    return [string]$format
}
function Get-GalleryImageExtension([byte[]]$bytes) {
    if($bytes.Length -lt 12){throw '图片内容不完整。'}
    if($bytes[0] -eq 255 -and $bytes[1] -eq 216 -and $bytes[2] -eq 255){return 'jpg'}
    if([BitConverter]::ToString($bytes,0,8) -eq '89-50-4E-47-0D-0A-1A-0A'){return 'png'}
    if([Text.Encoding]::ASCII.GetString($bytes,0,4) -eq 'RIFF' -and [Text.Encoding]::ASCII.GetString($bytes,8,4) -eq 'WEBP'){return 'webp'}
    if([Text.Encoding]::ASCII.GetString($bytes,0,6) -in @('GIF87a','GIF89a')){return 'gif'}
    throw '服务器未返回支持的图片格式。'
}
function Read-GalleryImageBody($response) {
    $limit=33554432
    if($response.Content.Headers.ContentLength -gt $limit){throw '单张图片超过 32 MB 限制。'}
    $stream=$response.Content.ReadAsStreamAsync().GetAwaiter().GetResult();$memory=New-Object IO.MemoryStream
    $deadline=New-Object Threading.CancellationTokenSource(60000)
    try{
        $buffer=New-Object byte[] 65536
        while(($count=$stream.ReadAsync($buffer,0,$buffer.Length,$deadline.Token).GetAwaiter().GetResult()) -gt 0){
            if($memory.Length+$count -gt $limit){throw '单张图片超过 32 MB 限制。'}
            $memory.Write($buffer,0,$count)
        }
        return ,$memory.ToArray()
    }finally{$deadline.Dispose();$memory.Dispose();$stream.Dispose()}
}
function Convert-GalleryImage([string]$source,[string]$destination,[string]$format,[string]$ffmpeg) {
    $format=Get-GalleryImageFormat $format
    if($format -eq 'original'){throw '原图无需转换。'}
    if(Test-Path -LiteralPath $destination){throw '目标图片已存在，已保留原文件。'}
    if((Get-Item -LiteralPath $source).Length -gt 33554432){throw '单张图片超过 32 MB 转换限制。'}
    $process=$null
    $arguments=@('-hide_banner','-loglevel','error','-nostdin','-n','-max_alloc','268435456','-threads','1','-max_pixels','40000000','-protocol_whitelist','file,pipe','-i',$source,'-frames:v','1','-threads','1')
    if($format -eq 'jpeg'){$arguments+=@('-filter_complex','[0:v]split[fg][bg];[bg]lutrgb=r=255:g=255:b=255,lut=a=255[white];[white][fg]overlay=format=auto,format=yuvj444p[out]','-map','[out]','-c:v','mjpeg','-q:v','2')}
    elseif($format -eq 'png'){$arguments+=@('-c:v','png','-pix_fmt','rgba')}
    else{$arguments+=@('-c:v','libwebp','-lossless','1','-pix_fmt','bgra')}
    $arguments+=@('-f','image2',$destination)
    try{
        $process=New-Object Diagnostics.Process
        $process.StartInfo.FileName=$ffmpeg
        $process.StartInfo.Arguments=(@($arguments|ForEach-Object{Quote-VideoArg ([string]$_)}) -join ' ')
        $process.StartInfo.UseShellExecute=$false;$process.StartInfo.CreateNoWindow=$true
        $process.StartInfo.RedirectStandardError=$true;$process.StartInfo.RedirectStandardOutput=$true
        $null=$process.Start()
        $stderr=$process.StandardError.ReadToEndAsync();$stdout=$process.StandardOutput.ReadToEndAsync()
        if(-not $process.WaitForExit(60000)){try{$process.Kill()}catch{};throw '图片转换超时，请使用原图或较小图片。'}
        $process.WaitForExit()
        if($process.ExitCode -ne 0 -or -not (Test-Path -LiteralPath $destination)){throw '图片转换失败，请使用原图或其他格式。'}
        $magic=New-Object byte[] 12;$stream=[IO.File]::OpenRead($destination)
        try{$null=$stream.Read($magic,0,12)}finally{$stream.Dispose()}
        $expected=if($format -eq 'jpeg'){'jpg'}else{$format}
        if((Get-GalleryImageExtension $magic) -ne $expected){throw '转换后的图片格式校验失败。'}
    }catch{if(Test-Path -LiteralPath $destination){Remove-Item -LiteralPath $destination};throw}
    finally{if($process){$process.Dispose()}}
}
