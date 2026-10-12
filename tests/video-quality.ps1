$ErrorActionPreference='Stop'
$root=Join-Path (Resolve-Path (Join-Path $PSScriptRoot '..')).Path ('work\quality-'+[Guid]::NewGuid().ToString('N'))
[IO.Directory]::CreateDirectory($root)|Out-Null
foreach($name in @('video.ps1','gallery-image.ps1')){Copy-Item (Join-Path $PSScriptRoot ('..\native\'+$name)) $root}
. (Join-Path $root 'video.ps1')
function Get-VideoSettings {return [pscustomobject]@{directory=(Join-Path $root 'files');cookies=''}}
function Get-VideoTools {return @{engine='mock';ffmpeg=(Join-Path $root 'ffmpeg.exe')}}
function Start-VideoProcess($exe,$arguments,$stdoutPath,$stderrPath){
 $formats=@(@{height=1078;quality=80;vcodec='avc1'},@{height=1078;quality=112;vcodec='avc1'},@{height=1078;quality=112;vcodec='hevc'},@{height=718;quality=64;vcodec='avc1'},@{height=2160;quality=120;vcodec='avc1';has_drm=$true})
 Write-VideoJson $stdoutPath @{title='Test';formats=$formats}
 [IO.File]::WriteAllText($stderrPath,'')
 $p=[pscustomobject]@{ExitCode=0};$p|Add-Member ScriptMethod WaitForExit {return $true};$p|Add-Member ScriptMethod Refresh {};return $p
}
function Get-ParallelVideoArgs($settings){return @()}
function Find-ExistingDownload($jobs,$candidate,$activeOnly){return ''}
function Submit-DownloadJob($path){}
$url='https://www.bilibili.com/video/BV1uzpY6NEe1/'
$r=Invoke-VideoActionCore ([pscustomobject]@{action='video-info';url=$url})
if($r.qualities.Count -ne 3 -or $r.qualities[0].quality -ne 112 -or $r.qualities[0].height -ne 1078 -or $r.qualities[0].label -notmatch '高码率'){throw 'Quality metadata collapsed or mislabeled'}
$r=Invoke-VideoActionCore ([pscustomobject]@{action='video-start';url=$url;height=1078;quality=112})
$job=Read-VideoJson (Join-Path $root ('video-jobs\'+$r.id+'.json'))
$format=$job.arguments[[Array]::IndexOf($job.arguments,'--format')+1]
if($format -ne 'bestvideo[quality=112]+bestaudio/best[quality=112]'){throw 'Premium format lost or fallback can downgrade'}
if($job.arguments[[Array]::IndexOf($job.arguments,'-o')+1] -notmatch '\[Q112\]'){throw 'Quality variants overwrite the same filename'}
Write-Output 'PASS same-height quality variants, codec deduplication, DRM exclusion, exact quality selection, distinct output filename'
