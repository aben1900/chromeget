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
    }elseif($bytes.Length -lt 20 -or [Text.Encoding]::ASCII.GetString($bytes,12,4) -notin @('VP8 ','VP8L','VP8X')){throw 'WEBP 图片内容无效。'}
    return @{format=$format;bytes=$bytes.Length}
}
function Get-CompanionImagePreview([string]$path){
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
        $draft.images=@($draft.images)+@($added)
        Write-VideoJson (Join-Path $jobs ($draftId+'.companion.json')) $draft
        return @{ok=$true;images=@($added|ForEach-Object{@{id=$_.id;role=$_.role;format=$_.format;source=$_.source;previewData=$_.previewData}})}
    }catch{foreach($target in $created){if(Test-Path -LiteralPath $target){Remove-Item -LiteralPath $target -Force}};throw}
}
function Add-VideoCompanionCapture([string]$draftId,[string]$png,[string]$sourceUrl,[string]$jobs){
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
        $draft.images=@($draft.images)+@($image)
        Write-VideoJson (Join-Path $jobs ($draftId+'.companion.json')) $draft
        return @{ok=$true;images=@(@{id=$id;role='extra';format='png';source='区域截图';previewData=$image.previewData})}
    }catch{if(Test-Path -LiteralPath $target){Remove-Item -LiteralPath $target -Force};throw}
}
function Stage-VideoCompanionCover([string]$draftId,[string]$imageId,[string]$jobs){
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
        $image|Add-Member -NotePropertyName format -NotePropertyValue $metadata.format -Force
        $image|Add-Member -NotePropertyName stagedPath -NotePropertyValue $target -Force
        $image.staged=$true
        Write-VideoJson (Join-Path $jobs ($draftId+'.companion.json')) $draft
        return @{ok=$true;images=@(@{id=$image.id;role='cover';format=$metadata.format;source='视频信息';previewData=(Get-CompanionImagePreview $target)})}
    }catch{if(Test-Path -LiteralPath $target){Remove-Item -LiteralPath $target -Force};throw}
}
function Show-VideoCompanionFilePicker([string]$draftId,[string]$jobs){
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
