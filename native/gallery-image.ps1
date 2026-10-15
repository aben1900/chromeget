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
    if(@($draft.images).Count -lt 1 -or @($draft.images).Count -gt 120){throw '图集图片数量无效。'}
    if([DateTime]::Parse($draft.created).ToUniversalTime().AddMinutes(30) -lt (Get-Date).ToUniversalTime()){throw '图片链接可能已过期，请重新获取图集后确认。'}
    $inlineSize=0;$captures=0
    foreach($item in $draft.images){
        $null=Assert-GalleryImage $item.url $draft.sourceKind
        if($item.url -clike 'capture:*'){$null=Resolve-GalleryCapture $item.url $jobs;$captures++}
        if($item.url -clike 'data:*'){$inlineSize+=$item.url.Length}
    }
    if($captures -gt 20 -or (@($draft.images).Count-$captures) -gt 100){throw '每个图集最多 100 张原有图片和 20 张截图。'}
    if($inlineSize -gt 524288){throw '内联 SVG 总大小超过限制。'}
    return $draft
}
function Get-GalleryCapturePngInfo([byte[]]$bytes) {
    if($bytes.Length -gt 8388608){throw '单张截图不能超过 8 MB。'}
    if($bytes.Length -lt 33 -or [BitConverter]::ToString($bytes,0,8) -cne '89-50-4E-47-0D-0A-1A-0A' -or [BitConverter]::ToString($bytes,8,4) -cne '00-00-00-0D' -or [Text.Encoding]::ASCII.GetString($bytes,12,4) -cne 'IHDR'){throw '截图不是有效的 PNG 图片。'}
    $width=[long]$bytes[16]*16777216+[long]$bytes[17]*65536+[long]$bytes[18]*256+$bytes[19]
    $height=[long]$bytes[20]*16777216+[long]$bytes[21]*65536+[long]$bytes[22]*256+$bytes[23]
    if($width -lt 1 -or $height -lt 1 -or $width -gt 40000000 -or $height -gt 40000000 -or $width*$height -gt 40000000){throw '截图不能超过 4000 万像素。'}
    Add-Type -AssemblyName System.Drawing
    $stream=[IO.MemoryStream]::new($bytes);$image=$null
    try{
        $image=[Drawing.Image]::FromStream($stream,$true,$true)
        if($image.RawFormat.Guid -ne [Drawing.Imaging.ImageFormat]::Png.Guid -or $image.Width -ne $width -or $image.Height -ne $height){throw '截图 PNG 尺寸无效。'}
        # Access a pixel to force raster decoding, rather than trusting IHDR alone.
        $null=$image.GetPixel([int]($width-1),[int]($height-1))
    }catch{throw '截图 PNG 内容损坏或无法解码。'}
    finally{if($image){$image.Dispose()};$stream.Dispose()}
    return @{width=[int]$width;height=[int]$height;format='png';bytes=$bytes.Length}
}
function Resolve-GalleryCapture([string]$token,[string]$jobs) {
    if($token -cnotmatch '\Acapture:([a-f0-9]{32})\z'){throw '截图编号无效。'}
    $root=[IO.Path]::GetFullPath($jobs).TrimEnd('\','/')
    $path=[IO.Path]::GetFullPath((Join-Path $root ($Matches[1]+'.capture.png')))
    if([IO.Path]::GetDirectoryName($path) -ine $root -or -not [IO.File]::Exists($path)){throw '截图文件不存在，请重新截图。'}
    $file=Get-Item -LiteralPath $path -Force
    if(($file.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0 -or $file.Length -gt 8388608){throw '截图文件无效或超过 8 MB。'}
    return $path
}
function Save-GalleryCapture($message,[string]$jobs,[string]$directory) {
    if($message.draftId){$draft=Read-GalleryDraft $message $jobs}
    else {
        $source=Assert-GalleryWebUrl ([string]$message.sourceUrl)
        $title=[string]$message.sourceTitle
        $draft=[pscustomobject]@{title=$title.Substring(0,[Math]::Min(200,$title.Length));noteId='';url=$source;images=@();created=(Get-Date).ToUniversalTime().ToString('o');sourceKind='webpage';siteName=([Uri]$source).DnsSafeHost}
    }
    if(@($draft.images|Where-Object{$_.url -clike 'capture:*'}).Count -ge 20){throw '每个图集最多添加 20 张截图。'}
    $png=$message.png
    if($png -isnot [string] -or $png.Length -gt 11184834 -or $png -cnotmatch '\Adata:image/png;base64,([A-Za-z0-9+/]*={0,2})\z'){throw '截图必须是 8 MB 以内的 PNG。'}
    try{$bytes=[Convert]::FromBase64String($Matches[1])}catch{throw '截图 PNG 编码无效。'}
    if($png -cne ('data:image/png;base64,'+[Convert]::ToBase64String($bytes))){throw '截图 PNG 编码无效。'}
    $metadata=Get-GalleryCapturePngInfo $bytes
    $captureId=[Guid]::NewGuid().ToString('N');$draftId=[Guid]::NewGuid().ToString('N')
    $image=[pscustomobject]@{url=('capture:'+$captureId);width=$metadata.width;height=$metadata.height;format='png';bytes=$metadata.bytes}
    $capturePath=Join-Path $jobs ($captureId+'.capture.png')
    # A new folder identity prevents prepending from reusing the old numbered files.
    $draft.noteId=$draftId;$draft.images=@($image)+@($draft.images)
    try{
        [IO.File]::WriteAllBytes($capturePath,$bytes)
        Write-VideoJson (Join-Path $jobs ($draftId+'.gallery.json')) $draft
    }catch{if([IO.File]::Exists($capturePath)){[IO.File]::Delete($capturePath)};throw}
    return @{ok=$true;draftId=$draftId;image=$image;directory=$directory}
}
function Save-WebGalleryPreview($message,$jobs,$directory) {
    $url=Assert-GalleryWebUrl ([string]$message.url)
    if(@($message.images).Count -gt 100){throw '每次最多获取 100 张网页图片。'}
    $inlineSize=0;$seen=@{};$images=@(foreach($item in @($message.images)){
        if([string]$item.url -clike 'capture:*'){continue}
        try{$imageUrl=Assert-GalleryImage ([string]$item.url) 'webpage'}catch{continue}
        if($seen.ContainsKey($imageUrl)){continue};$seen[$imageUrl]=$true
        if($imageUrl -clike 'data:*'){if($inlineSize+$imageUrl.Length -gt 524288){continue};$inlineSize+=$imageUrl.Length}
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
function Invoke-GalleryNetwork([string]$url,[string]$sourceKind,[string]$method,[string]$destination='',[int]$maxBytes=33554432) {
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
        $payload=[Text.Encoding]::UTF8.GetBytes((ConvertTo-Json -InputObject @{url=$url;sourceKind=$sourceKind;method=$method;destination=$destination;proxyUrl=$proxyUrl;maxBytes=$maxBytes} -Compress))
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
        $format=Get-GalleryMetadataFormat $type $url
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
    $metadata=@{format=(Get-GalleryMetadataFormat '' $url);bytes=$null}
    if($url -clike 'capture:*'){
        $metadata=Get-GalleryCapturePngInfo ([IO.File]::ReadAllBytes((Resolve-GalleryCapture $url $jobs)))
        return @{ok=$true;format='png';bytes=$metadata.bytes;width=$metadata.width;height=$metadata.height;canConvert=$true}
    }
    elseif($url -clike 'data:*'){$metadata=@{format='svg';bytes=(Read-GalleryInlineSvg $url).Length}}
    else{try{$head=Invoke-GalleryHead $url $draft.sourceKind;$metadata.bytes=$head.bytes;if($head.format){$metadata.format=$head.format}}catch{}}
    return @{ok=$true;format=$metadata.format;bytes=$metadata.bytes;width=$item.width;height=$item.height;canConvert=($metadata.format -ne 'svg')}
}
function Get-GalleryMetadataFormat([string]$mime,[string]$url='') {
    $types=@{'image/jpeg'='jpeg';'image/jpg'='jpeg';'image/pjpeg'='jpeg';'image/png'='png';'image/gif'='gif';'image/webp'='webp';'image/bmp'='bmp';'image/x-ms-bmp'='bmp';'image/svg+xml'='svg';'image/x-icon'='ico';'image/vnd.microsoft.icon'='ico';'image/tiff'='tiff';'image/x-tiff'='tiff';'image/avif'='avif'}
    $type=($mime -split ';',2)[0].Trim().ToLowerInvariant()
    if($types.ContainsKey($type)){return $types[$type]}
    $uri=$null;if(-not [Uri]::TryCreate($url,[UriKind]::Absolute,[ref]$uri)){return ''}
    $aliases=@{'jpg'='jpeg';'jpeg'='jpeg';'gif'='gif';'png'='png';'bmp'='bmp';'svg'='svg';'webp'='webp';'ico'='ico';'tif'='tiff';'tiff'='tiff';'avif'='avif'}
    foreach($part in $uri.Query.TrimStart('?') -split '&'){
        $pair=$part -split '=',2
        if($pair.Count -eq 2 -and $pair[0] -match '^(fmt|format|fm|ext)$'){$value=[Uri]::UnescapeDataString($pair[1]).ToLowerInvariant();if($aliases.ContainsKey($value)){return $aliases[$value]}}
    }
    $ext=[IO.Path]::GetExtension($uri.AbsolutePath).TrimStart('.').ToLowerInvariant()
    if($aliases.ContainsKey($ext)){return $aliases[$ext]};return ''
}
function Read-GallerySvgDocument([byte[]]$bytes,[int]$limit=33554432) {
    if($bytes.Length -gt $limit){throw 'SVG 内容超过大小限制。'}
    $settings=New-Object Xml.XmlReaderSettings
    $settings.DtdProcessing=[Xml.DtdProcessing]::Prohibit;$settings.XmlResolver=$null
    $settings.MaxCharactersInDocument=$limit;$settings.MaxCharactersFromEntities=1024
    $stream=[IO.MemoryStream]::new($bytes);$reader=$null
    try{
        $reader=[Xml.XmlReader]::Create($stream,$settings)
        $document=New-Object Xml.XmlDocument;$document.XmlResolver=$null;$document.PreserveWhitespace=$true
        $document.Load($reader)
        if($document.DocumentElement.LocalName -cne 'svg' -or $document.DocumentElement.NamespaceURI -cne 'http://www.w3.org/2000/svg'){throw '内容不是 SVG 图片。'}
        return ,$document
    }finally{if($reader){$reader.Dispose()};$stream.Dispose()}
}
function Read-GalleryInlineSvg([string]$url) {
    if($url.Length -gt 174790 -or $url -cnotmatch '^data:image/svg\+xml;base64,([A-Za-z0-9+/]*={0,2})$'){throw '内联 SVG 地址无效。'}
    try{$bytes=[Convert]::FromBase64String($Matches[1])}catch{throw '内联 SVG 编码无效。'}
    if($url -cne ('data:image/svg+xml;base64,'+[Convert]::ToBase64String($bytes))){throw '内联 SVG 编码无效。'}
    $document=Read-GallerySvgDocument $bytes 131072
    $elements='svg,g,defs,symbol,use,path,rect,circle,ellipse,line,polyline,polygon,text,tspan,title,desc,linearGradient,radialGradient,stop,clipPath,mask,pattern' -split ','
    $attributes='id,x,y,x1,y1,x2,y2,cx,cy,r,rx,ry,width,height,viewBox,preserveAspectRatio,d,points,transform,fill,fill-opacity,fill-rule,stroke,stroke-width,stroke-opacity,stroke-linecap,stroke-linejoin,stroke-miterlimit,stroke-dasharray,stroke-dashoffset,opacity,color,clip-path,clip-rule,mask,vector-effect,gradientUnits,gradientTransform,spreadMethod,offset,stop-color,stop-opacity,fx,fy,fr,patternUnits,patternContentUnits,patternTransform,clipPathUnits,maskUnits,maskContentUnits,text-anchor,dominant-baseline,font-family,font-size,font-style,font-weight,letter-spacing,word-spacing,dx,dy,rotate,textLength,lengthAdjust,href' -split ','
    if($document.SelectNodes('//processing-instruction()').Count){throw '内联 SVG 包含活动内容。'}
    foreach($node in $document.SelectNodes('//*')){
        if($node.NamespaceURI -cne 'http://www.w3.org/2000/svg' -or $node.LocalName -cnotin $elements){throw '内联 SVG 包含不支持的元素。'}
        foreach($attribute in $node.Attributes){
            if($attribute.Name -ceq 'xmlns' -and $attribute.Value -ceq 'http://www.w3.org/2000/svg'){continue}
            if($attribute.NamespaceURI -or $attribute.Name -cnotin $attributes){throw '内联 SVG 包含不支持的属性。'}
            $value=$attribute.Value
            if($value -match '@import|[\\\x00-\x1f<>]' -or ($attribute.Name -ceq 'href' -and $value -cnotmatch '^#[A-Za-z_][\w.:-]*$')){throw '内联 SVG 包含外部或活动内容。'}
            $withoutLocalUrls=[regex]::Replace($value,'(?i)url\(\s*#[A-Za-z_][\w.:-]*\s*\)','')
            if($withoutLocalUrls -match '(?i)url\s*\('){throw '内联 SVG 包含外部资源。'}
        }
    }
    return ,$bytes
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
    if($bytes[0] -eq 0x42 -and $bytes[1] -eq 0x4d -and $bytes.Length -ge 26){return 'bmp'}
    if([BitConverter]::ToString($bytes,0,4) -in @('49-49-2A-00','4D-4D-00-2A','49-49-2B-00','4D-4D-00-2B')){return 'tiff'}
    if([BitConverter]::ToString($bytes,0,4) -eq '00-00-01-00' -and [BitConverter]::ToUInt16($bytes,4) -gt 0 -and $bytes.Length -ge 22){return 'ico'}
    if([Text.Encoding]::ASCII.GetString($bytes,4,4) -eq 'ftyp'){
        $boxSize=[long]$bytes[0]*16777216+[long]$bytes[1]*65536+[long]$bytes[2]*256+$bytes[3]
        if($boxSize -ge 16 -and $boxSize -le $bytes.Length -and $boxSize -le 4096){
            for($offset=8;$offset+4 -le $boxSize;$offset+=4){if($offset -eq 12){continue};if([Text.Encoding]::ASCII.GetString($bytes,$offset,4) -in @('avif','avis')){return 'avif'}}
        }
    }
    try{$null=Read-GallerySvgDocument $bytes;return 'svg'}catch{}
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
    if((Get-GalleryImageExtension ([IO.File]::ReadAllBytes($source))) -eq 'svg'){throw 'SVG 仅支持下载原图。'}
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
