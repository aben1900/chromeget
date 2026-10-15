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
