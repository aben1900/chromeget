function Write-VideoJson($path, $value) {
    $temp = $path + '.' + [Guid]::NewGuid().ToString('N') + '.tmp'
    [IO.File]::WriteAllText($temp, (ConvertTo-Json -InputObject $value -Depth 8), (New-Object Text.UTF8Encoding($false)))
    if ([IO.File]::Exists($path)) { [IO.File]::Replace($temp,$path,[NullString]::Value) } else { [IO.File]::Move($temp,$path) }
}
function Read-VideoJson($path) {
    for($attempt=0;$attempt -lt 6;$attempt++){
        try{
            $stream=[IO.File]::Open($path,[IO.FileMode]::Open,[IO.FileAccess]::Read,([IO.FileShare]::ReadWrite -bor [IO.FileShare]::Delete))
            try{$reader=New-Object IO.StreamReader($stream);try{return ($reader.ReadToEnd()|ConvertFrom-Json)}finally{$reader.Dispose()}}finally{$stream.Dispose()}
        }catch [IO.IOException]{if($attempt -eq 5){throw};Start-Sleep -Milliseconds 50}
    }
}
function Quote-VideoArg([string]$value) {
    return '"' + [regex]::Replace([regex]::Replace($value,'(\\*)"','$1$1\"'),'(\\+)$','$1$1') + '"'
}
function Start-VideoProcess($exe, $arguments, $stdoutPath, $stderrPath) {
    $quoted = @($arguments | ForEach-Object { Quote-VideoArg ([string]$_) }) -join ' '
    $process = Start-Process -FilePath $exe -ArgumentList $quoted -WindowStyle Hidden -PassThru -RedirectStandardOutput $stdoutPath -RedirectStandardError $stderrPath
    $null = $process.Handle
    return $process
}
function Assert-BiliUrl([string]$url) {
    $uri = $null
    if (-not [Uri]::TryCreate($url,[UriKind]::Absolute,[ref]$uri) -or $uri.Scheme -ne 'https' -or $uri.Host -notin @('www.bilibili.com','bilibili.com','m.bilibili.com') -or $uri.UserInfo -or $uri.Port -ne 443 -or $uri.AbsolutePath -notmatch '^/(video/(BV[0-9A-Za-z]+|av[0-9]+)|bangumi/play/(ep|ss)[0-9]+)/?$') { throw '请粘贴完整的 B 站视频网址（https://www.bilibili.com/video/BV…），不支持短链接或其他网站。' }
    return $uri.AbsoluteUri
}
function Get-VideoTools {
    $engine = Join-Path $PSScriptRoot 'bin\yt-dlp.exe'
    if (-not (Test-Path -LiteralPath $engine)) { throw '缺少 yt-dlp，请运行安装.cmd 更新本地程序。' }
    $ffmpeg = Join-Path $PSScriptRoot 'bin\ffmpeg.exe'
    if (-not (Test-Path -LiteralPath $ffmpeg)) {
        $command = Get-Command ffmpeg.exe -ErrorAction SilentlyContinue
        if ($command) { $ffmpeg = $command.Source } else { throw '缺少 FFmpeg，请将 ffmpeg.exe 放入 native\bin 后重新安装。' }
    }
    return @{engine=$engine; ffmpeg=$ffmpeg}
}
function Assert-VideoUrl([string]$url) {
    try { return Assert-BiliUrl $url } catch { }
    $uri = $null
    if (-not [Uri]::TryCreate($url,[UriKind]::Absolute,[ref]$uri) -or $uri.Scheme -notin @('http','https') -or -not $uri.IsDefaultPort -or $uri.UserInfo) { throw '请填写 B 站、小红书、头条、X 或 YouTube 的视频网址。' }
    $builder = New-Object UriBuilder($uri)
    $builder.Scheme='https'; $builder.Port=-1; $builder.Fragment=''
    if ($uri.Host -in @('x.com','www.x.com','twitter.com','www.twitter.com','mobile.twitter.com') -and $uri.AbsolutePath -match '^/(?:[A-Za-z0-9_]+|i/web)/status/([0-9]+)(/video/[0-9]+)?/?$') { return 'https://x.com/i/web/status/'+$Matches[1]+$Matches[2] }
    if ($uri.Host -in @('youtube.com','www.youtube.com','m.youtube.com','music.youtube.com','youtu.be','www.youtu.be')) {
        $videoId=''
        if($uri.Host -in @('youtu.be','www.youtu.be')){$videoId=$uri.AbsolutePath.Trim('/')}
        elseif($uri.AbsolutePath -eq '/watch') {
            Add-Type -AssemblyName System.Web
            $videoId=[Web.HttpUtility]::ParseQueryString($uri.Query).Get('v')
        } elseif($uri.AbsolutePath -match '^/(?:shorts|live|embed)/([A-Za-z0-9_-]{11})/?$'){$videoId=$Matches[1]}
        if($videoId -cnotmatch '^[A-Za-z0-9_-]{11}$'){throw '请填写有效的 YouTube 单个视频网址。'}
        return 'https://www.youtube.com/watch?v='+$videoId
    }
    if ($uri.Host -in @('www.toutiao.com','toutiao.com','m.toutiao.com') -and $uri.AbsolutePath -match '^/(?:video/|group/|i)([0-9]+)/?$') {
        $builder.Host='www.toutiao.com'; $builder.Path='/video/'+$Matches[1]+'/'
        return $builder.Uri.AbsoluteUri
    }
    if ($uri.Host -in @('xhslink.com','www.xhslink.com') -and $uri.AbsolutePath -match '^/(?:[amo]/)?[A-Za-z0-9]+/?$') { return $builder.Uri.AbsoluteUri }
    if ($uri.Host -in @('www.xiaohongshu.com','xiaohongshu.com') -and $uri.AbsolutePath -match '^/(?:explore|discovery/item|user/profile/[a-f0-9]+)/([a-f0-9]+)/?$') {
        $builder.Host='www.xiaohongshu.com'; $builder.Path='/explore/'+$Matches[1]
        return $builder.Uri.AbsoluteUri
    }
    throw '请填写 B 站、小红书、头条、X 或 YouTube 的视频详情页，或小红书分享短链接。'
}
function Get-VideoSite([string]$url) {
    $valid = Assert-VideoUrl $url
    if (([Uri]$valid).Host -match '(^|\.)bilibili\.com$') { return 'bilibili' }
    if (([Uri]$valid).Host -eq 'www.toutiao.com') { return 'toutiao' }
    if (([Uri]$valid).Host -eq 'www.youtube.com') { return 'youtube' }
    if (([Uri]$valid).Host -eq 'x.com') { return 'x' }
    return 'xiaohongshu'
}
function Get-VideoSettings {
    $path = Join-Path $PSScriptRoot 'video-settings.json'
    if (Test-Path -LiteralPath $path) { return Read-VideoJson $path }
    return [PSCustomObject]@{directory=(Join-Path $env:USERPROFILE 'Downloads\精彩摘录视频'); cookies=''}
}
function Show-VideoDialog($dialog) {
    $owner = New-Object System.Windows.Forms.Form
    $owner.TopMost=$true; $owner.ShowInTaskbar=$false; $owner.Opacity=0
    $owner.StartPosition='CenterScreen'; $owner.Width=1; $owner.Height=1
    try { $owner.Show(); $owner.Activate(); return $dialog.ShowDialog($owner) }
    finally { $owner.Close(); $owner.Dispose() }
}
function Set-VideoDirectory($settings, [string]$directory) {
    if ($directory -notmatch '^[a-zA-Z]:[\\/]' -or $directory -match '[\r\n]') { throw '请输入本地绝对目录，例如 D:\视频。' }
    $directory=[IO.Path]::GetFullPath($directory)
    [IO.Directory]::CreateDirectory($directory) | Out-Null
    $probe=Join-Path $directory ([Guid]::NewGuid().ToString('N')+'.tmp')
    try { [IO.File]::WriteAllText($probe,'') } finally { if(Test-Path -LiteralPath $probe){Remove-Item -LiteralPath $probe} }
    $settings.directory=$directory
    Write-VideoJson (Join-Path $PSScriptRoot 'video-settings.json') $settings
    return @{ok=$true; directory=$settings.directory; cookies=([bool]$settings.cookies)}
}
function Get-VideoArgs($settings) {
    $arguments = @('--ignore-config','--no-playlist','--no-warnings','--no-colors','--encoding','utf-8','--socket-timeout','20','--retries','3','--fragment-retries','5')
    if ($settings.cookies) {
        if (-not (Test-Path -LiteralPath $settings.cookies -PathType Leaf)) { throw 'Cookie 文件不存在，请重新选择或清除。' }
        $arguments += @('--cookies',[string]$settings.cookies)
    }
    return $arguments
}
function Get-RecentVideoLocation([string]$jobs) {
    foreach ($entry in @(Get-ChildItem -LiteralPath $jobs -Filter '*.json' -File | Sort-Object LastWriteTimeUtc -Descending)) {
        if(Test-Path -LiteralPath ($entry.FullName+'.deleted')){continue}
        try { $job = Read-VideoJson $entry.FullName } catch { continue }
        if ($job.state -ne 'completed' -or $job.file -notmatch '^[a-zA-Z]:[\\/]' -or $job.directory -notmatch '^[a-zA-Z]:[\\/]') { continue }
        $file = [IO.Path]::GetFullPath($job.file)
        $directory = [IO.Path]::GetFullPath($job.directory).TrimEnd('\','/')
        if (-not $file.StartsWith($directory+'\',[StringComparison]::OrdinalIgnoreCase)) { continue }
        if (-not (Test-Path -LiteralPath $directory -PathType Container)) { throw '最近下载的目录已移动或删除。' }
        return @{file=$file; directory=$directory; exists=(Test-Path -LiteralPath $file -PathType Leaf)}
    }
    throw '尚无下载成功的视频，完成一次下载后即可打开位置。'
}
function Invoke-VideoActionCore($message) {
    $settings = Get-VideoSettings
    if($message.action -in @('video-hf-info','video-file-start','video-file-probe','video-transfer-settings')){
        . (Join-Path $PSScriptRoot 'transfer.ps1')
        return Invoke-TransferAction $message $settings
    }
    $genericMedia=$message.genericMedia -eq $true
    $site = if($genericMedia){'generic'}elseif ($message.site) { [string]$message.site } else { 'bilibili' }
    if ($site -notin @('bilibili','xiaohongshu','toutiao','youtube','x','generic')) { throw '不支持此视频平台。' }
    if ($message.action -in @('video-info','video-start','video-browser-cookies') -and $message.url -and -not $genericMedia) { $site = Get-VideoSite $message.url }
    $cookieProperty = if($site -eq 'generic'){'genericCookies'}elseif ($site -eq 'x') { 'xCookies' } elseif ($site -eq 'youtube') { 'youtubeCookies' } elseif ($site -eq 'toutiao') { 'toutiaoCookies' } elseif ($site -eq 'xiaohongshu') { 'xhsCookies' } else { 'cookies' }
    if (-not $settings.PSObject.Properties[$cookieProperty]) { $settings | Add-Member -NotePropertyName $cookieProperty -NotePropertyValue '' }
    $browserCookiePath = Join-Path $PSScriptRoot $(if ($site -eq 'x') { 'browser-x.cookies' } elseif ($site -eq 'youtube') { 'browser-youtube.cookies' } elseif ($site -eq 'toutiao') { 'browser-toutiao.cookies' } elseif ($site -eq 'xiaohongshu') { 'browser-xiaohongshu.cookies' } else { 'browser-login.cookies' })
    if($site -eq 'generic' -and $message.action -in @('video-browser-cookies','video-cookies','video-clear-cookies')){throw '通用解析暂不读取浏览器登录态。'}
    if ($message.action -eq 'video-browser-cookies') {
        $text = [string]$message.cookieText
        if ($text.Length -gt 262144 -or -not $text.StartsWith("# Netscape HTTP Cookie File`n")) { throw 'Cookie 格式无效。' }
        $loggedIn = $false
        foreach ($line in ($text -split "`n" | Select-Object -Skip 1)) {
            if (-not $line) { continue }
            $fields = $line -split "`t"
            $domainPattern = if ($site -eq 'x') { '^(#HttpOnly_)?\.?([a-zA-Z0-9-]+\.)*(x|twitter)\.com$' } elseif ($site -eq 'youtube') { '^(#HttpOnly_)?\.?([a-zA-Z0-9-]+\.)*youtube\.com$' } elseif ($site -eq 'toutiao') { '^(#HttpOnly_)?\.?([a-zA-Z0-9-]+\.)*toutiao\.com$' } elseif ($site -eq 'xiaohongshu') { '^(#HttpOnly_)?\.?([a-zA-Z0-9-]+\.)*xiaohongshu\.com$' } else { '^(#HttpOnly_)?\.?([a-zA-Z0-9-]+\.)*bilibili\.com$' }
            if ($fields.Count -ne 7 -or $line -match '[\r\x00]' -or $fields[0] -notmatch $domainPattern -or $fields[1] -notin @('TRUE','FALSE') -or $fields[2] -notmatch '^/' -or $fields[3] -notin @('TRUE','FALSE') -or $fields[4] -notmatch '^\d+$') { throw '仅允许有效的当前平台 Cookie。' }
            $loginNames = if ($site -eq 'x') { @('auth_token') } elseif ($site -eq 'youtube') { @('SID','SAPISID','__Secure-3PAPISID','__Secure-1PAPISID') } elseif ($site -eq 'toutiao') { @('ttwid','sessionid','sessionid_ss') } elseif ($site -eq 'xiaohongshu') { @('web_session') } else { @('SESSDATA') }
            if ($fields[5] -in $loginNames -and $fields[6]) { $loggedIn = $true }
        }
        if (-not $loggedIn) { throw '未找到当前平台登录态，请登录后重新获取。' }
        $temp = $browserCookiePath + '.' + [Guid]::NewGuid().ToString('N') + '.tmp'
        try {
            [IO.File]::WriteAllText($temp, $text, (New-Object Text.UTF8Encoding($false)))
            if ([IO.File]::Exists($browserCookiePath)) { [IO.File]::Replace($temp,$browserCookiePath,[NullString]::Value) } else { [IO.File]::Move($temp,$browserCookiePath) }
        } finally { if (Test-Path -LiteralPath $temp) { Remove-Item -LiteralPath $temp } }
        $settings.$cookieProperty = $browserCookiePath
        Write-VideoJson (Join-Path $PSScriptRoot 'video-settings.json') $settings
        return @{ok=$true; cookies=$true}
    }
    $jobs = Join-Path $PSScriptRoot 'video-jobs'
    [IO.Directory]::CreateDirectory($jobs) | Out-Null
    if ($message.action -eq 'video-gallery-start') { return Start-GalleryJob $message $jobs $(if($settings.autoClassify){Join-Path $settings.directory '图片'}else{$settings.directory}) }
    if ($message.action -eq 'video-open-task') {
        if($message.id -notmatch '^[a-f0-9]{32}$'){throw '下载任务编号无效。'}
        $path=Join-Path $jobs ($message.id+'.json')
        if(Test-Path -LiteralPath ($path+'.deleted')){throw '该任务已删除，请刷新任务列表。'}
        $job=Read-VideoJson $path
        if($job.directory -notmatch '^[a-zA-Z]:[\\/]' -or $job.directory -match '[\r\n]'){throw '任务保存目录无效。'}
        $directory=[IO.Path]::GetFullPath($job.directory)
        if(-not (Test-Path -LiteralPath $directory -PathType Container)){throw '任务保存目录已移动或删除。'}
        Start-Process -FilePath (Join-Path $env:SystemRoot 'explorer.exe') -ArgumentList (Quote-VideoArg $directory) -WindowStyle Normal|Out-Null
        return @{ok=$true;directory=$directory}
    }
    if ($message.action -eq 'video-open-recent') {
        $location = Get-RecentVideoLocation $jobs
        $arguments = if ($location.exists) { '/select,' + (Quote-VideoArg $location.file) } else { Quote-VideoArg $location.directory }
        Start-Process -FilePath (Join-Path $env:SystemRoot 'explorer.exe') -ArgumentList $arguments -WindowStyle Normal | Out-Null
        return @{ok=$true; directory=$location.directory; selected=$location.exists}
    }
    if ($message.action -eq 'video-status') {
        $tools = Get-VideoTools
        return @{ok=$true; directory=$settings.directory; cookies=([bool]$settings.$cookieProperty); maxActive=$(if($settings.maxActive){$settings.maxActive}else{3});autoClassify=([bool]$settings.autoClassify);adaptive=($settings.adaptive -ne $false);transferMode=$(if($settings.transferMode){$settings.transferMode}else{'fast'}); version='1.20.0'; modulePath=$PSCommandPath}
    }
    if ($message.action -eq 'video-set-folder') { return Set-VideoDirectory $settings ([string]$message.directory).Trim().Trim('"') }
    if ($message.action -in @('video-folder','video-cookies','video-clear-cookies')) {
        if ($message.action -eq 'video-clear-cookies') {
            $settings.$cookieProperty = ''
            if (Test-Path -LiteralPath $browserCookiePath) { Remove-Item -LiteralPath $browserCookiePath }
        }
        else {
            Add-Type -AssemblyName System.Windows.Forms
            if ($message.action -eq 'video-folder') { $dialog = New-Object System.Windows.Forms.FolderBrowserDialog; $dialog.Description='选择视频保存目录'; $dialog.SelectedPath=$settings.directory }
            else { $dialog = New-Object System.Windows.Forms.OpenFileDialog; $dialog.Title='选择当前视频平台的 Netscape Cookie 文件'; $dialog.Filter='Cookie 文件 (*.txt;*.cookies)|*.txt;*.cookies'; $dialog.CheckFileExists=$true }
            try {
                if ((Show-VideoDialog $dialog) -ne [System.Windows.Forms.DialogResult]::OK) { return @{ok=$true; cancelled=$true} }
                if ($message.action -eq 'video-folder') { $settings.directory=$dialog.SelectedPath } else { $settings.$cookieProperty=$dialog.FileName }
            } finally { $dialog.Dispose() }
        }
        if ($message.action -eq 'video-folder') { return Set-VideoDirectory $settings $settings.directory }
        Write-VideoJson (Join-Path $PSScriptRoot 'video-settings.json') $settings
        return @{ok=$true; directory=$settings.directory; cookies=([bool]$settings.cookies)}
    }
    if ($message.action -eq 'video-jobs') {
        Invoke-DownloadQueue
        $items=@()
        foreach($entry in @(Get-ChildItem -LiteralPath $jobs -Filter '*.json' -File | Where-Object {$_.BaseName -match '^[a-f0-9]{32}$'} | Sort-Object LastWriteTimeUtc -Descending)){
            try {
                $item=Invoke-VideoAction ([pscustomobject]@{action='video-job';id=$entry.BaseName})
                if($item.state -eq 'deleted'){continue}
                $item.id=$entry.BaseName;$items+=,$item
            } catch { continue }

        }
        $filter=if($message.statusFilter){[string]$message.statusFilter}else{'all'}
        if($filter -notin @('all','unfinished','active','queued','starting','running','paused','failed','completed')){throw '任务状态筛选无效。'}
        $items=@($items|Where-Object {
            $filter -eq 'all' -or ($filter -eq 'unfinished' -and $_.state -ne 'completed') -or ($filter -eq 'active' -and $_.state -in @('starting','running')) -or $_.state -eq $filter
        }|Sort-Object @{Expression={$_.createdAt};Descending=$true},@{Expression={$_.id};Descending=$true})
        $offset=[Math]::Max(0,[int]$message.offset)
        return @{ok=$true;items=@($items|Select-Object -Skip $offset -First 50);total=$items.Count;offset=$offset}

    }
    if ($message.action -eq 'video-resume') {
        if($message.id -notmatch '^[a-f0-9]{32}$'){throw '下载任务编号无效。'}
        $state=Invoke-VideoAction ([pscustomobject]@{action='video-job';id=$message.id})
        if($state.state -in @('queued','starting','running')){if($state.state -eq 'queued'){Invoke-DownloadQueue};return @{ok=$true;id=$message.id;directory=$state.directory}}
        if(-not $state.canResume){throw '该任务无需续传；图集请重新获取后确认。'}
        $previous=Read-VideoJson (Join-Path $jobs ($message.id+'.json'))
        $active=Find-ExistingDownload $jobs $previous $true
        if($active){return @{ok=$true;id=$active;directory=$previous.directory}}
        if($previous.kind -eq 'files'){
            foreach($entry in @(Get-ChildItem -LiteralPath $jobs -Filter '*.json' -File|Where-Object{$_.BaseName -match '^[a-f0-9]{32}$' -and $_.BaseName -ne $message.id})){
                if(Test-Path -LiteralPath ($entry.FullName+'.deleted')){continue}
                $other=Read-VideoJson $entry.FullName
                if($other.kind -eq 'files' -and @($other.expectedFiles|Where-Object{$_ -in $previous.expectedFiles}).Count){
                    $otherState=Invoke-VideoActionCore ([pscustomobject]@{action='video-job';id=$entry.BaseName})
                    if($otherState.state -in @('starting','running')){throw '相同文件正在其他任务下载，请等待完成后再续传。'}
                }
            }
        }
        $previous.PSObject.Properties.Remove('pid');$previous.PSObject.Properties.Remove('started')
        $previous.PSObject.Properties.Remove('childPid');$previous.PSObject.Properties.Remove('childStarted')
        if(-not $previous.createdAt){$previous|Add-Member -NotePropertyName createdAt -NotePropertyValue (Get-Item -LiteralPath (Join-Path $jobs ($message.id+'.json'))).CreationTimeUtc.ToString('o') -Force}
        $previous.state='starting';$previous.error='';$previous.file=''
        $id=$message.id;$jobPath=Join-Path $jobs ($id+'.json')
        if(Test-Path -LiteralPath ($jobPath+'.paused')){Remove-Item -LiteralPath ($jobPath+'.paused')}
        Write-VideoJson $jobPath $previous
        Submit-DownloadJob $jobPath
        return @{ok=$true;id=$id;directory=$previous.directory}
    }
    if($message.action -in @('video-delete','video-pause','video-transfer-settings')){
        if($message.id -notmatch '^[a-f0-9]{32}$'){throw '下载任务编号无效。'}
        $jobPath=Join-Path $jobs ($message.id+'.json')
        $job=Read-VideoJson $jobPath
        if($message.action -eq 'video-pause'){
            if(Test-Path -LiteralPath ($jobPath+'.deleted')){throw '任务已删除。'}
            $state=Invoke-VideoActionCore ([pscustomobject]@{action='video-job';id=$message.id})
            if($state.state -notin @('queued','starting','running')){return @{ok=$true}}
            [IO.File]::WriteAllText(($jobPath+'.paused'),'paused')
            $job.state='paused';Write-VideoJson $jobPath $job
        }else{[IO.File]::WriteAllText(($jobPath+'.deleted'),'deleted')}

        if($job.pid -and $job.started){
            $proc=Get-Process -Id $job.pid -ErrorAction SilentlyContinue
            if($proc -and $proc.StartTime.ToUniversalTime().Ticks -eq ([DateTime]$job.started).ToUniversalTime().Ticks){
                Stop-DownloadTree $job.pid
            }
        }
        if($job.childPid -and $job.childStarted){
            $child=Get-Process -Id $job.childPid -ErrorAction SilentlyContinue
            if($child -and $child.StartTime.ToUniversalTime().Ticks -eq ([DateTime]$job.childStarted).ToUniversalTime().Ticks){
                Stop-DownloadTree $job.childPid
            }
        }
        Invoke-DownloadQueue
        return @{ok=$true}
    }
    if ($message.action -eq 'video-job') {
        if ($message.id -notmatch '^[a-f0-9]{32}$') { throw '下载任务编号无效。' }
        $jobPath = Join-Path $jobs ($message.id + '.json')
        if(Test-Path -LiteralPath ($jobPath+'.deleted')){return @{ok=$true;state='deleted';canResume=$false}}
        $job = Read-VideoJson $jobPath
        if(Test-Path -LiteralPath ($jobPath+'.paused')){$job.state='paused'}
        if ($job.state -eq 'starting' -and (Get-Date).ToUniversalTime() -gt (Get-Item -LiteralPath $jobPath).LastWriteTimeUtc.AddMinutes(1)) { $job.state='failed'; $job.error='下载任务未能启动，请重试。' }
        if ($job.state -eq 'running') {
            $proc = Get-Process -Id $job.pid -ErrorAction SilentlyContinue
            if (-not $proc -or $proc.StartTime.ToUniversalTime().Ticks -ne ([DateTime]$job.started).ToUniversalTime().Ticks) {
                $child=if($job.childPid){Get-Process -Id $job.childPid -ErrorAction SilentlyContinue}else{$null}
                if(-not $child -or -not $job.childStarted -or $child.StartTime.ToUniversalTime().Ticks -ne ([DateTime]$job.childStarted).ToUniversalTime().Ticks){$job.state='failed'; $job.error='下载进程已停止，可重新下载以继续未完成文件。'}
            }
        }
        $logPath = Join-Path $jobs ($message.id + '.out.log')
        $progress = ''
        if (Test-Path -LiteralPath $logPath) { $progress = @(Get-Content -LiteralPath $logPath -Tail 5 -Encoding UTF8) -join "`n" }
        $createdAt=if($job.createdAt){([DateTime]$job.createdAt).ToUniversalTime().ToString('o')}else{(Get-Item -LiteralPath $jobPath).CreationTimeUtc.ToString('o')}
        $source=if($job.source){$job.source}elseif($job.arguments){@($job.arguments)[-1]}else{''}
        $metrics=$null;$metricsPath=Join-Path $jobs ($message.id+'.metrics.json');if(Test-Path -LiteralPath $metricsPath){try{$metrics=Read-VideoJson $metricsPath}catch{}}
        return @{ok=$true; metrics=$metrics;phase=$job.phase;probeSummary=@{total=@($job.probes).Count;success=@($job.probes|Where-Object{$_.ok}).Count;ranges=@($job.probes|Where-Object{$_.ok -and $_.rangeSupported}).Count};recoveryNote=$job.recoveryNote;validation=$job.validation;canPause=($job.state -in @('queued','starting','running')); state=$job.state; error=$job.error; progress=$progress; directory=$job.directory; file=$job.file; siteName=$job.siteName; createdAt=$createdAt; title=$job.title; source=$source; height=$job.height; canResume=($job.state -eq 'paused' -or ($job.state -eq 'failed' -and $job.kind -ne 'gallery' -and ($job.arguments -contains '--continue' -or $job.arguments -contains '--continue=true')))}
    }
    $tools = Get-VideoTools
    $url = if($genericMedia){Assert-MediaPageUrl $message.url}else{Assert-VideoUrl $message.url}
    $baseDirectory=$settings.directory
    $audio=$message.mediaMode -eq 'audio'
    $audioFormat=if($message.audioFormat){[string]$message.audioFormat}else{'best'}
    if($audioFormat -notin @('best','mp3','m4a','flac')){throw '不支持的音频格式。'}
    if($settings.autoClassify){$settings.directory=Join-Path $settings.directory $(if($audio){'音乐'}else{'视频'})}
    $arguments = @(Get-VideoArgs ([pscustomobject]@{cookies=$settings.$cookieProperty}))
    if(([Uri]$url).IsLoopback){$arguments+=@('--proxy','')}
    if($genericMedia -and $message.referer){$arguments+=@('--referer',(Assert-MediaPageUrl $message.referer))}
    if ($site -eq 'youtube') {
        $nodePath=Join-Path $PSScriptRoot 'bin\node.exe'
        if(-not (Test-Path -LiteralPath $nodePath)){$node=Get-Command node.exe -ErrorAction SilentlyContinue;if(-not $node){throw '缺少 Node.js，请更新完整安装包。'};$nodePath=$node.Source}
        $arguments += @('--js-runtimes',('node:'+$nodePath),'--socket-timeout','45','--retries','5')
    }
    if ($message.action -eq 'video-info') {
        $token = [Guid]::NewGuid().ToString('N')
        $out = Join-Path $jobs ($token+'.info.json'); $err = Join-Path $jobs ($token+'.error.log')
        try {
            $proc = Start-VideoProcess $tools.engine ($arguments + @('--ignore-no-formats-error','--dump-single-json','--skip-download','--',$url)) $out $err
            if (-not $proc.WaitForExit(90000)) { $proc.Kill(); $proc.WaitForExit(); throw '解析超时，请检查网络后重试。' }
            $proc.Refresh()
            if ($proc.ExitCode -ne 0) {
                if ($site -eq 'xiaohongshu') { throw '小红书未返回可下载的视频。请在浏览器打开视频笔记，复制带 xsec_token 等参数的完整网址，点击“一键使用本浏览器登录态”后重试；图文笔记、已失效链接或网站限制可能无法下载。' }
                throw ([IO.File]::ReadAllText($err))
            }
            $info = Read-VideoJson $out
            if ($info.media_kind -eq 'gallery') { return Save-GalleryPreview $info $url $jobs $(if($settings.autoClassify){Join-Path $baseDirectory '图片'}else{$settings.directory}) }
            $heights = @($info.formats | Where-Object { $_.vcodec -ne 'none' -and $_.height -gt 0 -and -not $_.has_drm } | ForEach-Object { [int]$_.height } | Sort-Object -Unique -Descending)
            if (-not @($info.formats | Where-Object { $_.vcodec -ne 'none' -and -not $_.has_drm }).Count) { throw '未找到可下载的视频。请确认是视频笔记，保留分享链接参数；需要登录时请获取本浏览器登录态后重试。' }
            if ($site -in @('xiaohongshu','toutiao','youtube','x','generic') -or -not $heights.Count) { $heights = @(0) + $heights }
            return @{ok=$true; title=$info.title; heights=$heights; directory=$settings.directory}
        } finally { foreach ($path in @($out,$err)) { if (Test-Path -LiteralPath $path) { Remove-Item -LiteralPath $path -Force } } }
    }
    if ($message.action -ne 'video-start') { throw '不支持的视频操作。' }
    $height = [int]$message.height
    if (($height -ne 0 -and $height -lt 1) -or $height -gt 8640) { throw '请选择有效分辨率。' }
    $format = if($audio){'bestaudio/best'}elseif ($height -eq 0) { 'bv*+ba/b' } else { "bestvideo[height=$height]+bestaudio/best[height=$height]" }
    $siteName = if($site -eq 'generic'){switch -Regex (([Uri]$url).Host){'(^|\.)tiktok\.com$'{'TikTok';break}'(^|\.)(reddit\.com|redd\.it)$'{'Reddit';break}'(^|\.)vimeo\.com$'{'Vimeo';break}'(^|\.)twitch\.tv$'{'Twitch';break}default{([Uri]$url).Host}}}elseif ($site -eq 'x') { 'X' } elseif ($site -eq 'youtube') { 'YouTube' } elseif ($site -eq 'toutiao') { '头条' } elseif ($site -eq 'xiaohongshu') { '小红书' } else { 'B站' }
    $id = [Guid]::NewGuid().ToString('N')
    $jobPath = Join-Path $jobs ($id+'.json')
    [IO.Directory]::CreateDirectory($settings.directory) | Out-Null
    $arguments += @(Get-ParallelVideoArgs $settings)
    $arguments += @('--ffmpeg-location',$tools.ffmpeg,'--continue','--newline','--progress','--windows-filenames','--merge-output-format','mp4','--format',$format,'-P',$settings.directory,'-o',("【$siteName】"+'%(title).100B [%(id)s] [%(height)sp].%(ext)s'),'--print','after_move:filepath','--no-simulate','--',$url)
    if($audio){
        $mergeIndex=[Array]::IndexOf($arguments,'--merge-output-format');$arguments=@($arguments[0..($mergeIndex-1)])+@($arguments[($mergeIndex+2)..($arguments.Count-1)])
        $outputIndex=[Array]::IndexOf($arguments,'-o');$arguments[$outputIndex+1]=('【'+$siteName+'】%(title).100B [%(id)s] [音频-'+$audioFormat+'].%(ext)s')
        $arguments=@('--extract-audio','--audio-format',$audioFormat,'--audio-quality','0')+$arguments
    }
    $newJob=@{mediaMode=$(if($audio){'audio'}else{'video'});audioFormat=$audioFormat;ffprobe=([IO.Path]::Combine([IO.Path]::GetDirectoryName($tools.ffmpeg),'ffprobe.exe'));createdAt=(Get-Date).ToUniversalTime().ToString('o');state='starting'; directory=$settings.directory; arguments=$arguments; engine=$tools.engine; error=''; file=''; siteName=$siteName;title=([string]$message.title);height=$height;source=$url}
    $existing=Find-ExistingDownload $jobs $newJob $false
    if($existing){return Invoke-VideoAction ([pscustomobject]@{action='video-resume';id=$existing})}
    Write-VideoJson $jobPath $newJob
    Submit-DownloadJob $jobPath
    return @{ok=$true; id=$id; directory=$settings.directory}
}
function Assert-GalleryImage([string]$url) {
    $uri=$null
    if(-not [Uri]::TryCreate($url,[UriKind]::Absolute,[ref]$uri) -or $uri.Scheme -ne 'https' -or $uri.Port -ne 443 -or $uri.UserInfo -or $uri.Host -notmatch '(^|\.)xhscdn\.com$'){throw '图集图片地址无效。'}
    return $uri.AbsoluteUri
}
function Save-GalleryPreview($info,$url,$jobs,$directory) {
    $images=@($info.gallery_images)
    if($images.Count -lt 1 -or $images.Count -gt 100){throw '未找到有效图集，或图片数量超过 100 张。'}
    foreach($item in $images){$item.url=Assert-GalleryImage $item.url}
    $id=[Guid]::NewGuid().ToString('N')
    Write-VideoJson (Join-Path $jobs ($id+'.gallery.json')) @{title=$info.title;noteId=$info.id;url=$url;images=$images;created=(Get-Date).ToUniversalTime().ToString('o')}
    return @{ok=$true;kind='gallery';draftId=$id;title=$info.title;images=$images;directory=$directory;heights=@()}
}
function Start-GalleryJob($message,$jobs,$directory) {
    if($message.confirmed -ne $true -or $message.draftId -notmatch '^[a-f0-9]{32}$'){throw '请先获取图集并确认下载。'}
    $draft=Read-VideoJson (Join-Path $jobs ($message.draftId+'.gallery.json'))
    $indexes=if($null -ne $message.selectedIndexes){@($message.selectedIndexes)}else{@(0..($draft.images.Count-1))}
    if($indexes.Count -eq 0){throw '请至少选择一张图片。'}
    $seen=@{}
    foreach($index in $indexes){
        if(($index -isnot [int] -and $index -isnot [long]) -or $index -lt 0 -or $index -ge $draft.images.Count -or $seen.ContainsKey([int]$index)){throw '所选图片编号无效，请重新获取图集。'}
        $seen[[int]$index]=$true
    }
    $images=@(foreach($index in @($indexes|Sort-Object)){
        $item=$draft.images[$index]
        [pscustomobject]@{url=$item.url;width=$item.width;height=$item.height;originalIndex=([int]$index+1)}
    })
    if([DateTime]::Parse($draft.created).ToUniversalTime().AddMinutes(30) -lt (Get-Date).ToUniversalTime()){throw '图片链接可能已过期，请重新获取图集后确认。'}
    foreach($item in $draft.images){$null=Assert-GalleryImage $item.url}
    if($draft.noteId -notmatch '^[a-f0-9]+$'){throw '图集编号无效。'}
    $title=([regex]::Replace([string]$draft.title,'[<>:"/\\|?*\x00-\x1f]','_')).Trim().TrimEnd('.')
    if($title.Length -gt 60){$title=$title.Substring(0,60)}
    $folder=Join-Path $directory ("【小红书】$title [$($draft.noteId)]")
    $existing=Find-ExistingDownload $jobs @{kind='gallery';directory=$folder} $true
    if($existing){
        $active=Read-VideoJson (Join-Path $jobs ($existing+'.json'))
        if((@($active.images.originalIndex) -join ',') -eq (@($images.originalIndex) -join ',')){return @{ok=$true;id=$existing;directory=$folder}}
        throw '该图集已有下载任务，请完成后再下载其他图片。'
    }
    [IO.Directory]::CreateDirectory($folder)|Out-Null
    $id=[Guid]::NewGuid().ToString('N');$jobPath=Join-Path $jobs ($id+'.json')
    Write-VideoJson $jobPath @{createdAt=(Get-Date).ToUniversalTime().ToString('o');state='starting';kind='gallery';directory=$folder;images=$images;title=$draft.title;source=$draft.url;error='';file='';siteName='小红书';completedCount=0}
    Submit-DownloadJob $jobPath
    return @{ok=$true;id=$id;directory=$folder}
}
function Invoke-GalleryDownload($job,$jobPath,$logPath) {
    Add-Type -AssemblyName System.Net.Http
    $handler=New-Object Net.Http.HttpClientHandler
    $handler.AllowAutoRedirect=$false
    $client=New-Object Net.Http.HttpClient($handler)
    $client.Timeout=[TimeSpan]::FromSeconds(60)
    $client.DefaultRequestHeaders.Referrer=[Uri]'https://www.xiaohongshu.com/'
    $client.DefaultRequestHeaders.UserAgent.ParseAdd('Mozilla/5.0')
    $files=@();$index=0
    try {
        foreach($item in $job.images){
            if(Test-Path -LiteralPath ($jobPath+'.deleted')){throw '任务已删除。'}
            $index++;$url=Assert-GalleryImage $item.url
            $number=if($item.originalIndex){[int]$item.originalIndex}else{$index}
            $response=$null;$temp=Join-Path $job.directory ('{0:D3}.part' -f $number)
            try {
                $response=$client.GetAsync($url).GetAwaiter().GetResult()
                $null=$response.EnsureSuccessStatusCode()
                $bytes=$response.Content.ReadAsByteArrayAsync().GetAwaiter().GetResult()
                if($bytes.Length -lt 12){throw '图片内容不完整。'}
                $ext=if($bytes[0] -eq 255 -and $bytes[1] -eq 216){'jpg'}elseif($bytes[0] -eq 137 -and $bytes[1] -eq 80){'png'}elseif([Text.Encoding]::ASCII.GetString($bytes,0,4) -eq 'RIFF' -and [Text.Encoding]::ASCII.GetString($bytes,8,4) -eq 'WEBP'){'webp'}elseif([Text.Encoding]::ASCII.GetString($bytes,0,3) -eq 'GIF'){'gif'}else{throw '服务器未返回支持的图片格式。'}
                $file=Join-Path $job.directory ('{0:D3}.{1}' -f $number,$ext)
                if(-not (Test-Path -LiteralPath $file)){
                    [IO.File]::WriteAllBytes($temp,$bytes);[IO.File]::Move($temp,$file)
                }
                $files+=@{index=$number;file=[IO.Path]::GetFileName($file);width=$item.width;height=$item.height}
                $job.completedCount=$index;$job.file=$file
                Write-VideoJson $jobPath $job
                [IO.File]::WriteAllText($logPath,"已保存 $index / $($job.images.Count) 张图片",(New-Object Text.UTF8Encoding($false)))
            } finally {if($response){$response.Dispose()};if(Test-Path -LiteralPath $temp){Remove-Item -LiteralPath $temp}}
        }
        $manifest=Join-Path $job.directory '图集信息.json'
        if(Test-Path -LiteralPath $manifest){
            $previous=Read-VideoJson $manifest
            $files=@(@($previous.images)+$files|Group-Object index|ForEach-Object {$_.Group[-1]}|Sort-Object {[int]$_.index})
        }
        Write-VideoJson $manifest @{title=$job.title;source=$job.source;count=$files.Count;images=$files}
    } finally {$client.Dispose();$handler.Dispose()}
}
function Get-DownloadKey($job){
    if($job.kind -eq 'files'){return 'files|'+$job.directory+'|'+($job.expectedFiles -join '|')}
    if($job.kind -eq 'gallery'){return 'gallery|'+$job.directory}
    $argsList=@($job.arguments)
    $formatIndex=[Array]::IndexOf($argsList,'--format')
    $format=if($formatIndex -ge 0){$argsList[$formatIndex+1]}else{''}
    return $job.directory+'|'+$argsList[-1]+'|'+$format+$(if($job.mediaMode -eq 'audio'){'|audio|'+[string]$job.audioFormat}else{''})
}
function Find-ExistingDownload($jobs,$candidate,[bool]$activeOnly){
    $key=Get-DownloadKey $candidate;$failed=''
    foreach($entry in @(Get-ChildItem -LiteralPath $jobs -Filter '*.json' -File|Where-Object {$_.BaseName -match '^[a-f0-9]{32}$'}|Sort-Object LastWriteTimeUtc -Descending)){
        if(Test-Path -LiteralPath ($entry.FullName+'.deleted')){continue}
        try{
            $job=Read-VideoJson $entry.FullName
            if((Get-DownloadKey $job) -ne $key){continue}
            $state=Invoke-VideoAction ([pscustomobject]@{action='video-job';id=$entry.BaseName})
            if($state.state -in @('queued','starting','running')){return $entry.BaseName}
            if(-not $activeOnly -and $state.canResume -and -not $failed){$failed=$entry.BaseName}
        }catch{continue}
    }
    return $failed
}
function Invoke-VideoAction($message){
    if($message.action -notin @('video-start','video-resume','video-gallery-start','video-file-start','video-delete','video-pause','video-transfer-settings')){return Invoke-VideoActionCore $message}
    $mutex=New-Object Threading.Mutex($false,'Local\JingcaiTaskMutations')
    $held=$false
    try{
        try{$held=$mutex.WaitOne(15000)}catch [Threading.AbandonedMutexException]{$held=$true}
        if(-not $held){throw '任务列表繁忙，请稍后重试。'}
        return Invoke-VideoActionCore $message
    }finally{if($held){$mutex.ReleaseMutex()};$mutex.Dispose()}
}

function Stop-DownloadTree([int]$processId){
    $killer=Start-Process -FilePath "$env:SystemRoot\System32\taskkill.exe" -ArgumentList @('/PID',[string]$processId,'/T','/F') -WindowStyle Hidden -PassThru
    try{if(-not $killer.WaitForExit(5000)){$killer.Kill();throw '停止任务超时，请稍后重试删除。'}}finally{$killer.Dispose()}
}

function Get-ParallelVideoArgs($settings){
    $mode=if($settings.transferMode){$settings.transferMode}else{'fast'}
    if($mode -eq 'compatible'){return @('--concurrent-fragments','1')}
    $count=if($mode -in @('fast','extreme')){16}else{4}
    $argsList=@('--concurrent-fragments',[string]$count)
    $aria=Join-Path $PSScriptRoot 'bin\aria2c.exe'
    if(Test-Path -LiteralPath $aria){
        $split=if($mode -eq 'extreme'){64}elseif($mode -eq 'fast'){32}else{4}
        $argsList+=@('--downloader',('http,https:'+$aria),'--downloader-args',("aria2c:-x $count -s $split -k 1M --file-allocation=none"))
    }
    return $argsList
}

function Get-DownloadFailure([string]$base,[int]$exitCode){
    $details=@()
    foreach($suffix in @('.error.log','.out.log')){
        $path=$base+$suffix
        if(-not (Test-Path -LiteralPath $path)){continue}
        $lines=@(Get-Content -LiteralPath $path -Tail 400 -Encoding UTF8)
        $indexes=@(for($i=0;$i -lt $lines.Count;$i++){if($lines[$i] -match '\[ERROR\]|errorCode=|Exception:|ERROR:|SSL/TLS|certificate verification'){$i}})
        if($indexes.Count){foreach($index in $indexes){$details+=@($lines[$index..([Math]::Min($index+2,$lines.Count-1))])}}
        elseif($suffix -eq '.error.log'){$details+=@($lines|Select-Object -Last 20)}
    }
    $message=(@($details|Where-Object{$_ -and $_.Trim()}|Select-Object -Unique)-join "`n")
    if(-not $message){$message="下载引擎退出（代码 $exitCode），请检查网络和任务日志。"}
    if($message.Length -gt 4000){$message=$message.Substring(0,4000)}
    if($message -match 'SSL/TLS handshake failure'){$message="HTTPS 握手失败，连接被远端或代理中断。请检查网络 / 代理后点击续传。`n"+$message}
    return $message
}
function Test-TransientDownloadFailure([string]$message){
    if($message -match '(?i)certificate|cert verification|证书'){return $false}
    return $message -match '(?i)SSL/TLS handshake failure|connection reset|远程主机强迫关闭'
}

function Submit-DownloadJob([string]$jobPath){
    $job=Read-VideoJson $jobPath;$job.state='queued'
    $job|Add-Member queuedAt ((Get-Date).ToUniversalTime().ToString('o')) -Force
    Write-VideoJson $jobPath $job
    Invoke-DownloadQueue
    $watcher=Join-Path $PSScriptRoot 'queue-watch.ps1'
    if((Read-VideoJson $jobPath).state -eq 'queued' -and (Test-Path -LiteralPath $watcher)){
        $argsList=@('-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',$watcher)|ForEach-Object{Quote-VideoArg $_}
        Start-Process -FilePath "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe" -ArgumentList ($argsList -join ' ') -WindowStyle Hidden|Out-Null
    }
}
function Invoke-DownloadQueue {
    $mutex=New-Object Threading.Mutex($false,'Local\JingcaiTaskMutations');$held=$false
    try{
        try{$held=$mutex.WaitOne(0)}catch [Threading.AbandonedMutexException]{$held=$true}
        if(-not $held){return}
        $settings=Get-VideoSettings;$limit=if($settings.maxActive){[int]$settings.maxActive}else{3}
        $jobs=Join-Path $PSScriptRoot 'video-jobs';if(-not (Test-Path -LiteralPath $jobs)){return}
        $active=0;$queued=@()
        foreach($entry in @(Get-ChildItem -LiteralPath $jobs -Filter '*.json' -File|Where-Object{$_.BaseName -match '^[a-f0-9]{32}$'})){
            if((Test-Path -LiteralPath ($entry.FullName+'.deleted')) -or (Test-Path -LiteralPath ($entry.FullName+'.paused'))){continue}
            try{$job=Read-VideoJson $entry.FullName;$state=Invoke-VideoActionCore ([pscustomobject]@{action='video-job';id=$entry.BaseName})}catch{continue}
            if($state.state -in @('starting','running')){$active++}
            elseif($state.state -eq 'queued'){$queued+=@{path=$entry.FullName;job=$job;order=$job.queuedAt}}
        }
        foreach($entry in @($queued|Sort-Object @{Expression={([DateTime]$_.order).Ticks}})){
            if($active -ge $limit){break}
            $entry.job.state='starting';Write-VideoJson $entry.path $entry.job
            $argsList=@('-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',(Join-Path $PSScriptRoot 'video-worker.ps1'),'-JobPath',$entry.path)
            try{Start-Process -FilePath "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe" -ArgumentList ((@($argsList|ForEach-Object{Quote-VideoArg $_})) -join ' ') -WindowStyle Hidden|Out-Null;$active++}
            catch{$entry.job.state='failed';$entry.job.error=$_.Exception.Message;Write-VideoJson $entry.path $entry.job}
        }
    }finally{if($held){$mutex.ReleaseMutex()};$mutex.Dispose()}
}
function Get-DownloadCategory([string]$name){
    switch -Regex ([IO.Path]::GetExtension($name).ToLowerInvariant()){
        '^\.(mp4|mkv|webm|avi|mov|m4v)$'{return '视频'}
        '^\.(mp3|m4a|aac|flac|wav|ogg|opus)$'{return '音乐'}
        '^\.(exe|msi|msix|appx|dmg|apk)$'{return '程序'}
        '^\.(zip|7z|rar|gz|tar|xz|bz2)$'{return '压缩包'}
        '^\.(gguf|safetensors|onnx|pt|pth|ckpt)$'{return '模型'}
        '^\.(jpg|jpeg|png|gif|webp|avif)$'{return '图片'}
        '^\.(pdf|docx?|xlsx?|pptx?|txt|md|csv|json)$'{return '文档'}
        default{return '其他'}
    }
}

function Assert-MediaPageUrl([string]$url){
    $uri=$null
    if(-not [Uri]::TryCreate($url,[UriKind]::Absolute,[ref]$uri) -or $uri.Scheme -notin @('http','https') -or $uri.UserInfo -or $url -match '[\r\n]'){throw '请填写 HTTP/HTTPS 视频详情页或 m3u8/mpd 清单网址。'}
    return $uri.AbsoluteUri
}
