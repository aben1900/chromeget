function Get-CompanionPublicUrl([string]$url){
    $uri=$null
    if(-not [Uri]::TryCreate($url,[UriKind]::Absolute,[ref]$uri) -or $uri.Scheme -notin @('http','https') -or $uri.UserInfo){return ''}
    Add-Type -AssemblyName System.Web
    $builder=New-Object UriBuilder($uri)
    $query=[Web.HttpUtility]::ParseQueryString($builder.Query)
    foreach($key in @($query.AllKeys)){
        if($key -match 'token|sign|auth|cookie|secret|key|credential|expires|policy'){$query.Remove($key)}
    }
    $builder.Query=$query.ToString()
    $builder.Fragment=''
    return $builder.Uri.AbsoluteUri
}
function Limit-VideoCompanionText([string]$text,[int]$maxChars,[int]$maxBytes,[bool]$source=$false){
    $value=([string]$text).Replace("`0",'').Replace("`r`n","`n").Replace("`r","`n")
    $truncated=$false
    if($value.Length -gt $maxChars){if(-not $source){throw '配套文字超过长度限制。'};$value=$value.Substring(0,$maxChars);$truncated=$true}
    while([Text.Encoding]::UTF8.GetByteCount($value) -gt $maxBytes){
        if(-not $source){throw '配套文字超过容量限制。'}
        $value=$value.Substring(0,$value.Length-1);$truncated=$true
    }
    return @{value=$value;truncated=$truncated}
}
function New-VideoCompanionDraft($info,[string]$url,[string]$sourcePageUrl,[string]$jobs,[string]$site){
    $title=Limit-VideoCompanionText ([string]$info.title) 120 1024 $true
    $author=Limit-VideoCompanionText ([string]$(if($info.uploader){$info.uploader}elseif($info.channel){$info.channel}else{$info.creator})) 120 1024 $true
    $body=Limit-VideoCompanionText ([string]$info.description) 20000 65536 $true
    $images=@();$candidates=@($info.thumbnail)+@($info.thumbnails|ForEach-Object{$_.url})
    foreach($candidate in $candidates){
        if(-not $candidate){continue}
        try{
            $imageUrl=if($site -eq 'xiaohongshu'){Assert-GalleryImage ([string]$candidate) 'xiaohongshu'}else{Assert-GalleryWebUrl ([string]$candidate)}
            $images=@(@{id=[Guid]::NewGuid().ToString('N');role='cover';previewUrl=$imageUrl;url=$imageUrl;source='视频信息';staged=$false})
            break
        }catch{continue}
    }
    $id=[Guid]::NewGuid().ToString('N')
    $public=Get-CompanionPublicUrl $sourcePageUrl
    $draft=@{draftId=$id;url=$url;sourcePageRaw=$sourcePageUrl;sourcePageUrl=$public;title=$title.value;author=$author.value;text=$body.value;truncated=$body.truncated;images=$images;created=(Get-Date).ToUniversalTime().ToString('o')}
    [IO.Directory]::CreateDirectory($jobs)|Out-Null
    Write-VideoJson (Join-Path $jobs ($id+'.companion.json')) $draft
    return @{draftId=$id;title=$draft.title;author=$draft.author;text=$draft.text;truncated=$draft.truncated;sourcePageUrl=$public;images=@($images|ForEach-Object{@{id=$_.id;role=$_.role;previewUrl=$_.previewUrl;source=$_.source;staged=$false}})}
}
function Read-VideoCompanionDraft([string]$draftId,[string]$url,[string]$jobs){
    if($draftId -cnotmatch '^[a-f0-9]{32}$'){throw '配套资料草稿编号无效，请重新获取视频。'}
    $path=Join-Path $jobs ($draftId+'.companion.json')
    if(-not (Test-Path -LiteralPath $path -PathType Leaf)){throw '配套资料草稿已丢失，请重新获取视频。'}
    $draft=Read-VideoJson $path
    if($draft.url -cne $url){throw '视频网址已变化，请重新获取视频。'}
    if([DateTime]::Parse($draft.created).ToUniversalTime().AddMinutes(30) -lt (Get-Date).ToUniversalTime()){throw '配套资料草稿已过期，请重新获取视频。'}
    return $draft
}
function Update-VideoCompanionDraft([string]$draftId,[string]$url,[string]$jobs,[scriptblock]$edit){
    $mutex=[Threading.Mutex]::new($false,('Local\JingcaiClipperCompanionDraft_'+$draftId))
    $locked=$false
    try{
        try{$locked=$mutex.WaitOne(70000)}catch [Threading.AbandonedMutexException]{$locked=$true}
        if(-not $locked){throw '配套资料正在处理，请稍后重试。'}
        $current=Read-VideoCompanionDraft $draftId $url $jobs
        & $edit $current
        Write-VideoJson (Join-Path $jobs ($draftId+'.companion.json')) $current
        return $current
    }finally{if($locked){$mutex.ReleaseMutex()};$mutex.Dispose()}
}
function Clear-VideoCompanionGarbage([string]$jobs){
    if(-not (Test-Path -LiteralPath $jobs -PathType Container)){return}
    $root=[IO.Path]::GetFullPath($jobs).TrimEnd('\','/')+'\'
    $protected=New-Object 'System.Collections.Generic.HashSet[string]' ([StringComparer]::OrdinalIgnoreCase)
    foreach($entry in @(Get-ChildItem -LiteralPath $jobs -Filter '*.json' -File|Where-Object{$_.BaseName -match '^[a-f0-9]{32}$'})){
        if(Test-Path -LiteralPath ($entry.FullName+'.deleted')){continue}
        try{
            $job=Read-VideoJson $entry.FullName
            if(-not $job.companion -or ($job.state -eq 'completed' -and $job.companion.status -ne 'partial' -and -not $job.libraryWarning)){continue}
            foreach($image in @($job.companion.images)){
                $path=[IO.Path]::GetFullPath([string]$image.stagedPath)
                if($path.StartsWith($root,[StringComparison]::OrdinalIgnoreCase)){$null=$protected.Add($path)}
            }
        }catch{continue}
    }
    $cutoff=(Get-Date).ToUniversalTime().AddHours(-1)
    foreach($entry in @(Get-ChildItem -LiteralPath $jobs -Filter '*.companion.json' -File)){
        if($entry.Name -cnotmatch '^[a-f0-9]{32}\.companion\.json$'){continue}
        try{$draft=Read-VideoJson $entry.FullName;$created=[DateTime]::Parse([string]$draft.created).ToUniversalTime()}
        catch{$created=$entry.LastWriteTimeUtc}
        if($created -lt $cutoff){Remove-Item -LiteralPath $entry.FullName -Force -ErrorAction SilentlyContinue}
    }
    foreach($entry in @(Get-ChildItem -LiteralPath $jobs -Filter '*.companion-image' -File)){
        if($entry.Name -cnotmatch '^[a-f0-9]{32}\.[a-f0-9]{32}\.companion-image$'){continue}
        if($entry.LastWriteTimeUtc -lt $cutoff -and -not $protected.Contains($entry.FullName)){Remove-Item -LiteralPath $entry.FullName -Force -ErrorAction SilentlyContinue}
    }
}
function Get-CompanionImageMetadata([string]$path){
    $item=Get-Item -LiteralPath $path -ErrorAction Stop
    if(($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0 -or $item.Length -lt 12 -or $item.Length -gt 8388608){throw '配套图片必须是 8 MB 以内的普通文件。'}
    $bytes=[IO.File]::ReadAllBytes($path)
    $format=Get-GalleryImageExtension $bytes
    if($format -notin @('jpg','png','webp','gif')){throw '配套图片仅支持 JPEG、PNG、WEBP 或 GIF。'}
    if($format -ne 'webp'){
        Add-Type -AssemblyName System.Drawing
        $stream=[IO.MemoryStream]::new($bytes);$image=$null
        try{$image=[Drawing.Image]::FromStream($stream,$true,$true);if($image.Width -lt 1 -or $image.Height -lt 1 -or ([long]$image.Width*$image.Height) -gt 40000000){throw '图片尺寸无效。'}}
        catch{throw '图片内容损坏或无法解码。'}
        finally{if($image){$image.Dispose()};$stream.Dispose()}
    }else{
        if($bytes.Length -lt 20 -or [Text.Encoding]::ASCII.GetString($bytes,12,4) -notin @('VP8 ','VP8L','VP8X')){throw 'WEBP 图片内容无效。'}
        $probe=Join-Path $PSScriptRoot 'bin\ffprobe.exe'
        if(-not (Test-Path -LiteralPath $probe)){$command=Get-Command ffprobe.exe -ErrorAction SilentlyContinue;if($command){$probe=$command.Source}else{throw '缺少 FFprobe，无法验证 WEBP 图片。'}}
        try{$output=& $probe -v quiet -select_streams v:0 -show_entries stream=codec_name,width,height -of json -i $path | Out-String;$result=ConvertFrom-Json $output}
        catch{throw 'WEBP 图片内容损坏或无法解码。'}
        $stream=@($result.streams)|Select-Object -First 1
        if($LASTEXITCODE -ne 0 -or -not $stream -or $stream.codec_name -ne 'webp' -or $stream.width -lt 1 -or $stream.height -lt 1 -or ([long]$stream.width*$stream.height) -gt 40000000){throw 'WEBP 图片内容损坏或尺寸无效。'}
        $decoder=Join-Path $PSScriptRoot 'bin\ffmpeg.exe'
        if(-not (Test-Path -LiteralPath $decoder)){$command=Get-Command ffmpeg.exe -ErrorAction SilentlyContinue;if($command){$decoder=$command.Source}else{throw '缺少 FFmpeg，无法解码 WEBP 图片。'}}
        $null=& $decoder -v quiet -xerror -err_detect explode -i $path -frames:v 1 -f null NUL
        if($LASTEXITCODE -ne 0){throw 'WEBP 图片内容损坏或无法解码。'}
    }
    return @{format=$format;bytes=$bytes.Length}
}
function Get-CompanionImagePreview([string]$path){
    if((Get-GalleryImageExtension ([IO.File]::ReadAllBytes($path))) -eq 'webp'){
        $decoder=Join-Path $PSScriptRoot 'bin\ffmpeg.exe'
        if(-not (Test-Path -LiteralPath $decoder)){$command=Get-Command ffmpeg.exe -ErrorAction SilentlyContinue;if($command){$decoder=$command.Source}else{return ''}}
        $thumbnail=Join-Path ([IO.Path]::GetTempPath()) ([Guid]::NewGuid().ToString('N')+'.jpg')
        try{
            $null=& $decoder -v quiet -y -i $path -vf 'scale=180:180:force_original_aspect_ratio=decrease' -frames:v 1 -q:v 5 $thumbnail
            if($LASTEXITCODE -eq 0 -and (Test-Path -LiteralPath $thumbnail)){$bytes=[IO.File]::ReadAllBytes($thumbnail);if($bytes.Length -le 40960){return 'data:image/jpeg;base64,'+[Convert]::ToBase64String($bytes)}}
        }catch{}finally{if(Test-Path -LiteralPath $thumbnail){Remove-Item -LiteralPath $thumbnail -Force}}
        return ''
    }
    Add-Type -AssemblyName System.Drawing
    $source=$null;$bitmap=$null;$graphics=$null;$output=$null
    try{
        $source=[Drawing.Image]::FromFile($path)
        $scale=[Math]::Min(180.0/[Math]::Max(1,$source.Width),180.0/[Math]::Max(1,$source.Height))
        $width=[Math]::Max(1,[int][Math]::Round($source.Width*$scale));$height=[Math]::Max(1,[int][Math]::Round($source.Height*$scale))
        $bitmap=New-Object Drawing.Bitmap($width,$height);$graphics=[Drawing.Graphics]::FromImage($bitmap)
        $graphics.DrawImage($source,0,0,$width,$height);$output=New-Object IO.MemoryStream
        $bitmap.Save($output,[Drawing.Imaging.ImageFormat]::Jpeg)
        if($output.Length -le 40960){return 'data:image/jpeg;base64,'+[Convert]::ToBase64String($output.ToArray())}
    }catch{}
    finally{if($output){$output.Dispose()};if($graphics){$graphics.Dispose()};if($bitmap){$bitmap.Dispose()};if($source){$source.Dispose()}}
    return ''
}
function Add-VideoCompanionFiles([string]$draftId,[string[]]$paths,[string]$jobs){
    if($draftId -cnotmatch '^[a-f0-9]{32}$'){throw '配套资料草稿编号无效。'}
    if($paths.Count -lt 1 -or $paths.Count -gt 10){throw '每次请选择 1–10 张图片。'}
    $draft=Read-VideoCompanionDraft $draftId ((Read-VideoJson (Join-Path $jobs ($draftId+'.companion.json'))).url) $jobs
    if(@($draft.images).Count+$paths.Count -gt 10){throw '配套图片最多 10 张（含封面）。'}
    $added=@();$created=@()
    try{
        foreach($path in $paths){
            if(-not [IO.Path]::IsPathRooted($path)){throw '请选择本地普通图片文件。'}
            $source=[IO.Path]::GetFullPath($path)
            $metadata=Get-CompanionImageMetadata $source
            $id=[Guid]::NewGuid().ToString('N');$target=Join-Path $jobs ($draftId+'.'+$id+'.companion-image')
            [IO.File]::Copy($source,$target,$false);$created+=,$target
            $image=@{id=$id;role='extra';source='本地图片';format=$metadata.format;staged=$true;stagedPath=$target;previewData=(Get-CompanionImagePreview $target)}
            $added+=,$image
        }
        $null=Update-VideoCompanionDraft $draftId $draft.url $jobs {
            param($current)
            if(@($current.images).Count+$added.Count -gt 10){throw '配套图片最多 10 张（含封面）。'}
            $current.images=@($current.images)+@($added)
        }
        return @{ok=$true;images=@($added|ForEach-Object{@{id=$_.id;role=$_.role;format=$_.format;source=$_.source;previewData=$_.previewData}})}
    }catch{foreach($target in $created){if(Test-Path -LiteralPath $target){Remove-Item -LiteralPath $target -Force}};throw}
}
function Add-VideoCompanionCapture([string]$draftId,[string]$png,[string]$sourceUrl,[string]$jobs){
    if($draftId -cnotmatch '^[a-f0-9]{32}$'){throw '配套资料草稿编号无效。'}
    $draft=Read-VideoCompanionDraft $draftId ((Read-VideoJson (Join-Path $jobs ($draftId+'.companion.json'))).url) $jobs
    if((Get-CompanionPublicUrl $sourceUrl) -cne $draft.sourcePageUrl){throw '截图来源已变化，请返回原视频帖重新框选。'}
    if(@($draft.images).Count -ge 10){throw '配套图片最多 10 张（含封面）。'}
    if($png.Length -gt 11184834 -or $png -cnotmatch '\Adata:image/png;base64,([A-Za-z0-9+/]*={0,2})\z'){throw '截图必须是 8 MB 以内的 PNG。'}
    $bytes=[Convert]::FromBase64String($Matches[1])
    if($png -cne ('data:image/png;base64,'+[Convert]::ToBase64String($bytes))){throw '截图编码无效。'}
    $null=Get-GalleryCapturePngInfo $bytes
    $id=[Guid]::NewGuid().ToString('N');$target=Join-Path $jobs ($draftId+'.'+$id+'.companion-image')
    try{
        [IO.File]::WriteAllBytes($target,$bytes)
        $image=@{id=$id;role='extra';source='区域截图';format='png';staged=$true;stagedPath=$target;previewData=(Get-CompanionImagePreview $target)}
        $null=Update-VideoCompanionDraft $draftId $draft.url $jobs {
            param($current)
            if(@($current.images).Count -ge 10){throw '配套图片最多 10 张（含封面）。'}
            $current.images=@($current.images)+@($image)
        }
        return @{ok=$true;images=@(@{id=$id;role='extra';format='png';source='区域截图';previewData=$image.previewData})}
    }catch{if(Test-Path -LiteralPath $target){Remove-Item -LiteralPath $target -Force};throw}
}
function Stage-VideoCompanionCover([string]$draftId,[string]$imageId,[string]$jobs){
    if($draftId -cnotmatch '^[a-f0-9]{32}$' -or $imageId -cnotmatch '^[a-f0-9]{32}$'){throw '配套资料草稿或图片编号无效。'}
    $draft=Read-VideoCompanionDraft $draftId ((Read-VideoJson (Join-Path $jobs ($draftId+'.companion.json'))).url) $jobs
    $image=@($draft.images|Where-Object{$_.id -ceq $imageId -and $_.role -eq 'cover'})|Select-Object -First 1
    if(-not $image){throw '封面编号无效，请重新获取视频。'}
    if($image.staged){return @{ok=$true;images=@(@{id=$image.id;role='cover';source='视频信息';previewUrl=$image.previewUrl})}}
    $kind=if(([Uri]$image.url).Host -match '(^|\.)xhscdn\.com$'){'xiaohongshu'}else{'webpage'}
    $null=Assert-GalleryImage $image.url $kind
    $target=Join-Path $jobs ($draftId+'.'+$imageId+'.companion-image')
    try{
        $null=Invoke-GalleryNetwork $image.url $kind 'GET' $target 8388608
        $metadata=Get-CompanionImageMetadata $target
        $null=Update-VideoCompanionDraft $draftId $draft.url $jobs {
            param($current)
            $cover=@($current.images|Where-Object{$_.id -ceq $imageId -and $_.role -eq 'cover'})|Select-Object -First 1
            if(-not $cover){throw '封面已移除。'}
            $cover|Add-Member -NotePropertyName format -NotePropertyValue $metadata.format -Force
            $cover|Add-Member -NotePropertyName stagedPath -NotePropertyValue $target -Force
            $cover.staged=$true
        }
        return @{ok=$true;images=@(@{id=$image.id;role='cover';format=$metadata.format;source='视频信息';previewData=(Get-CompanionImagePreview $target)})}
    }catch{if(Test-Path -LiteralPath $target){Remove-Item -LiteralPath $target -Force};throw}
}
function Remove-VideoCompanionImage([string]$draftId,[string]$imageId,[string]$jobs){
    if($draftId -cnotmatch '^[a-f0-9]{32}$' -or $imageId -cnotmatch '^[a-f0-9]{32}$'){throw '配套资料草稿或图片编号无效。'}
    $draft=Read-VideoCompanionDraft $draftId ((Read-VideoJson (Join-Path $jobs ($draftId+'.companion.json'))).url) $jobs
    $null=Update-VideoCompanionDraft $draftId $draft.url $jobs {
        param($current)
        if(-not @($current.images|Where-Object{$_.id -ceq $imageId}).Count){throw '配套图片已移除。'}
        $current.images=@($current.images|Where-Object{$_.id -cne $imageId})
    }
    return @{ok=$true}
}
function Show-VideoCompanionFilePicker([string]$draftId,[string]$jobs){
    if($draftId -cnotmatch '^[a-f0-9]{32}$'){throw '配套资料草稿编号无效。'}
    $null=Read-VideoCompanionDraft $draftId ((Read-VideoJson (Join-Path $jobs ($draftId+'.companion.json'))).url) $jobs
    Add-Type -AssemblyName System.Windows.Forms
    $dialog=New-Object Windows.Forms.OpenFileDialog
    try{
        $dialog.Title='选择视频配套图片';$dialog.Filter='图片 (*.jpg;*.jpeg;*.png;*.webp;*.gif)|*.jpg;*.jpeg;*.png;*.webp;*.gif'
        $dialog.Multiselect=$true;$dialog.CheckFileExists=$true
        if((Show-VideoDialog $dialog) -ne [Windows.Forms.DialogResult]::OK){return @{ok=$true;cancelled=$true}}
        return Add-VideoCompanionFiles $draftId @($dialog.FileNames) $jobs
    }finally{$dialog.Dispose()}
}
function Commit-VideoCompanion($message,[string]$url,[string]$jobs){
    $draft=Read-VideoCompanionDraft ([string]$message.companionDraftId) $url $jobs
    $titleValue=if($null -ne $message.companionTitle){[string]$message.companionTitle}else{[string]$draft.title}
    $bodyValue=if($null -ne $message.companionText){[string]$message.companionText}else{[string]$draft.text}
    $title=Limit-VideoCompanionText ($titleValue -replace '[\r\n]+',' ') 120 1024
    $body=Limit-VideoCompanionText $bodyValue 20000 65536
    $author=Limit-VideoCompanionText (([string]$draft.author) -replace '[\r\n]+',' ') 120 1024
    $ids=@($message.companionImageIds);if($ids.Count -gt 10){throw '配套图片最多 10 张。'}
    $seen=@{};$images=@();$root=[IO.Path]::GetFullPath($jobs).TrimEnd('\','/')+'\'
    foreach($id in $ids){
        if($id -isnot [string] -or $id -cnotmatch '^[a-f0-9]{32}$' -or $seen.ContainsKey($id)){throw '所选配套图片编号无效。'}
        $seen[$id]=$true
        $image=@($draft.images|Where-Object{$_.id -ceq $id})|Select-Object -First 1
        if(-not $image -or -not $image.staged -or -not $image.stagedPath){throw '配套图片尚未准备完成，请移除或重新添加。'}
        $path=[IO.Path]::GetFullPath([string]$image.stagedPath)
        if(-not $path.StartsWith($root,[StringComparison]::OrdinalIgnoreCase)){throw '配套图片位置无效。'}
        $metadata=Get-CompanionImageMetadata $path
        if($metadata.format -cne [string]$image.format){throw '配套图片内容已变化，请重新添加。'}
        $images+=@{id=$id;role=[string]$image.role;format=$metadata.format;source=[string]$image.source;stagedPath=$path;savedPath=''}
    }
    $public=Get-CompanionPublicUrl ([string]$draft.sourcePageRaw)
    $digestInput=ConvertTo-Json -InputObject @($title.value,$body.value,$author.value,$public,@($images|ForEach-Object{$_.id})) -Compress -Depth 5
    $sha=[Security.Cryptography.SHA256]::Create()
    try{$digest=([BitConverter]::ToString($sha.ComputeHash([Text.Encoding]::UTF8.GetBytes($digestInput)))).Replace('-','').ToLowerInvariant()}finally{$sha.Dispose()}
    return @{title=$title.value;text=$body.value;author=$author.value;publicSourceUrl=$public;digest=$digest;images=$images;status='pending';files=@();errors=@()}
}
function Test-CompanionSameFile([string]$left,[string]$right){
    if(-not [IO.File]::Exists($left) -or -not [IO.File]::Exists($right)){return $false}
    if((Get-Item -LiteralPath $left).Length -ne (Get-Item -LiteralPath $right).Length){return $false}
    $sha=[Security.Cryptography.SHA256]::Create()
    try{
        $a=[IO.File]::OpenRead($left);try{$aHash=[BitConverter]::ToString($sha.ComputeHash($a))}finally{$a.Dispose()}
        $b=[IO.File]::OpenRead($right);try{$bHash=[BitConverter]::ToString($sha.ComputeHash($b))}finally{$b.Dispose()}
        return $aHash -ceq $bHash
    }finally{$sha.Dispose()}
}
function Assert-CompanionNoLinks([string]$path){
    $current=[IO.Path]::GetFullPath($path)
    while($true){
        if(Test-Path -LiteralPath $current){
            $item=Get-Item -LiteralPath $current -Force
            if(($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0){throw '配套资料路径包含链接，请使用普通本地目录。'}
        }
        $parent=[IO.Path]::GetDirectoryName($current)
        if(-not $parent -or $parent -eq $current){break}
        $current=$parent
    }
}
function Write-VideoCompanionFiles($job,[string]$jobPath){
    if(-not $job.companion){return}
    $companion=$job.companion
    if(-not $companion.text -and @($companion.images).Count -eq 0){$companion.status='complete';$companion.files=@();$companion.errors=@();return}
    $directory=[IO.Path]::GetFullPath([string]$job.directory).TrimEnd('\','/')
    $media=[IO.Path]::GetFullPath([string]$job.file)
    if(-not $media.StartsWith($directory+'\',[StringComparison]::OrdinalIgnoreCase) -or -not (Test-Path -LiteralPath $media -PathType Leaf)){throw '视频文件不在所选下载目录内。'}
    Assert-CompanionNoLinks $media
    $id=[IO.Path]::GetFileNameWithoutExtension($jobPath)
    if($id -cnotmatch '^[a-f0-9]{32}$'){throw '任务编号无效。'}
    $stem=[IO.Path]::GetFileNameWithoutExtension($media);if($stem.Length -gt 60){$stem=$stem.Substring(0,60)}
    $folder=Join-Path ([IO.Path]::GetDirectoryName($media)) ($stem+'-'+$id.Substring(0,8)+'-配套资料')
    if(Test-Path -LiteralPath $folder){if((Get-Item -LiteralPath $folder).Attributes -band [IO.FileAttributes]::ReparsePoint){throw '配套目录不能是链接。'}}
    else{[IO.Directory]::CreateDirectory($folder)|Out-Null}
    $saved=@();$errors=@()
    $note=Join-Path $folder '说明.txt'
    $text=@("标题：$($companion.title)","作者：$($companion.author)","来源：$($companion.publicSourceUrl)",'',"正文：",[string]$companion.text) -join "`r`n"
    $temp=$note+'.'+[Guid]::NewGuid().ToString('N')+'.tmp'
    try{
        if(-not [IO.File]::Exists($note)){[IO.File]::WriteAllText($temp,$text,[Text.UTF8Encoding]::new($false));[IO.File]::Move($temp,$note)}
        elseif([IO.File]::ReadAllText($note,[Text.Encoding]::UTF8) -cne $text){throw '已有说明文件内容不同，未覆盖。'}
        $saved+=,$note
    }catch{$errors+=,$_.Exception.Message}
    finally{if([IO.File]::Exists($temp)){[IO.File]::Delete($temp)}}
    $extra=0
    foreach($image in @($companion.images)){
        if($image.role -ne 'cover'){$extra++}
        $name=if($image.role -eq 'cover'){'封面'}else{'配图-'+$extra.ToString('00')}
        $destination=Join-Path $folder ($name+'.'+[string]$image.format)
        $temp=$destination+'.'+[Guid]::NewGuid().ToString('N')+'.tmp'
        try{
            $source=[string]$image.stagedPath
            $metadata=Get-CompanionImageMetadata $source
            if($metadata.format -cne [string]$image.format){throw '图片格式发生变化。'}
            if(-not [IO.File]::Exists($destination)){[IO.File]::Copy($source,$temp,$false);[IO.File]::Move($temp,$destination)}
            elseif(-not (Test-CompanionSameFile $source $destination)){throw '已有配图内容不同，未覆盖。'}
            $image.savedPath=$destination;$saved+=,$destination
        }catch{$errors+=,($name+'：'+$_.Exception.Message)}
        finally{if([IO.File]::Exists($temp)){[IO.File]::Delete($temp)}}
    }
    $companion.files=@($saved);$companion.errors=@($errors);$companion.status=if($errors.Count){'partial'}else{'complete'}
}
