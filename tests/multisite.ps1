$ErrorActionPreference='Stop'
$root=Join-Path (Resolve-Path (Join-Path $PSScriptRoot '..')).Path ('work\multisite-test-'+[Guid]::NewGuid().ToString('N'))
[IO.Directory]::CreateDirectory($root)|Out-Null
Copy-Item -LiteralPath (Join-Path $PSScriptRoot '..\native\video.ps1') -Destination (Join-Path $root 'video.ps1')
Copy-Item -LiteralPath (Join-Path $PSScriptRoot '..\native\gallery-image.ps1') -Destination $root
Copy-Item -LiteralPath (Join-Path $PSScriptRoot '..\native\video-companion.ps1') -Destination $root
. (Join-Path $root 'video.ps1')
Write-VideoJson (Join-Path $root 'video-settings.json') @{directory=$root;cookies=''}
$url=Assert-VideoUrl 'http://www.xiaohongshu.com/user/profile/abc/def?xsec_token=a%2Bb&xsec_source=pc'
if($url -ne 'https://www.xiaohongshu.com/explore/def?xsec_token=a%2Bb&xsec_source=pc'){throw 'Lost token or normalization failed'}
if((Assert-VideoUrl 'http://xhslink.com/a/Ab123') -ne 'https://xhslink.com/a/Ab123'){throw 'Short link failed'}
foreach($bad in @('https://www.xiaohongshu.com.evil.com/explore/abc','https://user@www.xiaohongshu.com/explore/abc','https://www.xiaohongshu.com:8443/explore/abc','file:///C:/secret')){
 $rejected=$false;try{Assert-VideoUrl $bad|Out-Null}catch{$rejected=$true};if(-not $rejected){throw 'Invalid URL accepted'}
}
$bili="# Netscape HTTP Cookie File`n.bilibili.com`tTRUE`t/`tTRUE`t0`tSESSDATA`tsynthetic`n"
$xhs=$bili.Replace('.bilibili.com','.xiaohongshu.com').Replace('SESSDATA','web_session')
Invoke-VideoAction ([pscustomobject]@{action='video-browser-cookies';site='bilibili';cookieText=$bili})|Out-Null
Invoke-VideoAction ([pscustomobject]@{action='video-browser-cookies';site='xiaohongshu';cookieText=$xhs})|Out-Null
$settings=Get-VideoSettings
if([IO.File]::ReadAllText($settings.cookies) -ne $bili -or [IO.File]::ReadAllText($settings.xhsCookies) -ne $xhs){throw 'Cookie separation failed'}
function Get-VideoTools { return @{engine='mock';ffmpeg='mock'} }
function Start-VideoProcess($exe,$arguments,$stdoutPath,$stderrPath){
 $script:lastArguments=$arguments
 Write-VideoJson $stdoutPath @{title='fixture';formats=@(@{format_id='direct';vcodec='h264';height=$null},@{vcodec='h264';height=720})}
 $proc=[pscustomobject]@{ExitCode=0};$proc|Add-Member ScriptMethod WaitForExit {param($timeout) return $true};$proc|Add-Member ScriptMethod Refresh {};return $proc
}
$info=Invoke-VideoAction ([pscustomobject]@{action='video-info';url=$url})
if(($info.heights -join ',') -ne '0,720' -or $script:lastArguments -notcontains $settings.xhsCookies -or $script:lastArguments -contains $settings.cookies){throw 'Formats or selected cookie failed'}
function Start-Process { param($FilePath,$ArgumentList,$WindowStyle) }
$job=Invoke-VideoAction ([pscustomobject]@{action='video-start';url=$url;height=0})
$saved=Read-VideoJson (Join-Path $root ('video-jobs\'+$job.id+'.json'))
if($saved.arguments -notcontains 'bv*+ba/b' -or $saved.arguments -notcontains $url){throw 'Best-quality job failed'}
if($saved.siteName -ne ([string][char]0x5c0f+[char]0x7ea2+[char]0x4e66) -or $saved.arguments[$saved.arguments.IndexOf('-o')+1] -notlike ('*'+$saved.siteName+'*')){throw 'Site title prefix missing'}
Invoke-VideoAction ([pscustomobject]@{action='video-clear-cookies';site='xiaohongshu'})|Out-Null
if((Get-VideoSettings).xhsCookies -or -not (Test-Path -LiteralPath $settings.cookies)){throw 'Clearing one site affected another'}
Write-Output 'PASS XHS URL/token normalization, short links, site cookie isolation, unknown-height formats, best-quality download job, independent clear'

$ttUrl=Assert-VideoUrl 'http://m.toutiao.com/i7505382061495176511/?foo=bar'
if($ttUrl -ne 'https://www.toutiao.com/video/7505382061495176511/?foo=bar' -or (Get-VideoSite $ttUrl) -ne 'toutiao'){throw 'Toutiao URL failed'}
$ttCookie=$bili.Replace('.bilibili.com','.toutiao.com').Replace('SESSDATA','ttwid')
Invoke-VideoAction ([pscustomobject]@{action='video-browser-cookies';site='toutiao';cookieText=$ttCookie})|Out-Null
$ttSettings=Get-VideoSettings
$ttInfo=Invoke-VideoAction ([pscustomobject]@{action='video-info';url=$ttUrl})
if($script:lastArguments -notcontains $ttSettings.toutiaoCookies -or $script:lastArguments -contains $ttSettings.cookies){throw 'Toutiao cookie selection failed'}
$ttJob=Invoke-VideoAction ([pscustomobject]@{action='video-start';url=$ttUrl;height=720})
$ttSaved=Read-VideoJson (Join-Path $root ('video-jobs\'+$ttJob.id+'.json'))
$ttName=[string][char]0x5934+[char]0x6761
if($ttSaved.siteName -ne $ttName -or $ttSaved.arguments[$ttSaved.arguments.IndexOf('-o')+1] -notlike ('*'+$ttName+'*')){throw 'Toutiao filename prefix failed'}
Invoke-VideoAction ([pscustomobject]@{action='video-clear-cookies';site='toutiao'})|Out-Null
if((Get-VideoSettings).toutiaoCookies -or -not (Test-Path -LiteralPath $ttSettings.cookies)){throw 'Toutiao clear affected Bilibili'}
Write-Output 'PASS Toutiao URL, platform detection, isolated cookies, parsing, selected-quality task and filename prefix'
$ttAgain=Invoke-VideoAction ([pscustomobject]@{action='video-start';url=$ttUrl;height=720})
if($ttAgain.id -ne $ttJob.id){throw 'Repeated start created another task'}
Write-Output 'PASS repeated start returns original task'
