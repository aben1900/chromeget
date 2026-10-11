param([switch]$Apply,[string]$Root=(Split-Path $PSScriptRoot -Parent),[string]$HostRoot=(Join-Path $env:LOCALAPPDATA 'JingcaiClipper'),[switch]$FunctionsOnly)
$ErrorActionPreference='Stop'
function Get-ChromegetRelease {
 [Net.ServicePointManager]::SecurityProtocol=[Net.SecurityProtocolType]::Tls12
 $r=Invoke-RestMethod 'https://api.github.com/repos/aben1900/chromeget/releases/latest' -Headers @{'User-Agent'='chromeget-updater'} -TimeoutSec 30
 if($r.draft -or $r.prerelease -or $r.tag_name -notmatch '^v(\d+\.\d+\.\d+)$'){throw '无有效正式版本'}
 $version=$Matches[1];$name="chromeget-v$version-windows-x64-setup.zip"
 $zip=@($r.assets|Where-Object name -eq $name);$sum=@($r.assets|Where-Object name -eq 'SHA256SUMS.txt')
 if($zip.Count -ne 1 -or $sum.Count -ne 1){throw '发布包或校验文件缺失'}
 foreach($a in @($zip[0],$sum[0])){if($a.browser_download_url -notlike "https://github.com/aben1900/chromeget/releases/download/v$version/*"){throw '更新来源无效'}}
 return @{version=$version;name=$name;url=$zip[0].browser_download_url;sumUrl=$sum[0].browser_download_url}
}
function Expand-ChromegetPackage([string]$Zip,[string]$Stage,[string]$Version) {
 Add-Type -AssemblyName System.IO.Compression.FileSystem
 $a=[IO.Compression.ZipFile]::OpenRead($Zip)
 try{foreach($entry in $a.Entries){$n=$entry.FullName.Replace('\','/');if($n.StartsWith('/') -or $n -match '(^|/)\.\.(/|$)|:' -or $entry.Length -gt 100MB){throw '安装包路径或大小异常'}}}finally{$a.Dispose()}
 Expand-Archive -LiteralPath $Zip -DestinationPath $Stage
 $v=(Get-Content -LiteralPath (Join-Path $Stage 'extension\manifest.json') -Raw -Encoding UTF8|ConvertFrom-Json).version
 if($v -ne $Version -or -not(Test-Path -LiteralPath (Join-Path $Stage 'native\install.ps1'))){throw '安装包版本不一致'}
}
function Install-ChromegetPackage([string]$Stage,[string]$Destination,[scriptblock]$InstallHost) {
 $Stage=[IO.Path]::GetFullPath($Stage)
 $Destination=[IO.Path]::GetFullPath($Destination)
 if(Test-Path -LiteralPath (Join-Path $Destination '.git')){throw '这是开发源码目录，请通过 Git 更新；统一更新用于 Release 解压目录，避免覆盖开发改动。'}
 $backup=Join-Path $Destination ('.chromeget-update-backup-'+[Guid]::NewGuid().ToString('N'))
 [IO.Directory]::CreateDirectory($backup)|Out-Null
 $changed=New-Object Collections.Generic.List[object]
 try{
  foreach($file in Get-ChildItem -LiteralPath $Stage -Recurse -File){
   $relative=$file.FullName.Substring($Stage.TrimEnd('\').Length+1)
   if($relative -notmatch '^(extension\\|showcase\\|tools\\|tests\\|native\\[^\\]+\.(ps1|cmd|cjs|cs)$|native\\bin\\yt-dlp-plugins\\|AGENTS\.md$|README\.md$|LICENSE$|PRIVACY\.md$|THIRD_PARTY_NOTICES\.md$|开始使用\.cmd$|使用说明\.md$|功能介绍\.html$)'){throw "更新包含非程序文件：$relative"}
   $dest=Join-Path $Destination $relative;$old=Join-Path $backup $relative;$existed=Test-Path -LiteralPath $dest
   if($existed){[IO.Directory]::CreateDirectory((Split-Path $old))|Out-Null;Copy-Item -LiteralPath $dest -Destination $old}
   $changed.Add(@{dest=$dest;old=$old;existed=$existed})
   [IO.Directory]::CreateDirectory((Split-Path $dest))|Out-Null;Copy-Item -LiteralPath $file.FullName -Destination $dest -Force
  }
  & $InstallHost
  Write-Output '程序文件已更新。请重新打开管理中心，在 Chrome 重新加载扩展，再检查三个版本是否一致。'
 }catch{
  for($i=$changed.Count-1;$i -ge 0;$i--){$c=$changed[$i];if($c.existed){Copy-Item -LiteralPath $c.old -Destination $c.dest -Force}else{Remove-Item -LiteralPath $c.dest -Force -ErrorAction SilentlyContinue}}
  throw "更新失败，扩展目录已回退。备份：$backup。$($_.Exception.Message)"
 }
}
if($FunctionsOnly){return}
$current=(Get-Content -LiteralPath (Join-Path $Root 'extension\manifest.json') -Raw -Encoding UTF8|ConvertFrom-Json).version
$release=Get-ChromegetRelease
Write-Output "本地安装包 $current；最新正式版 $($release.version)"
if([version]$release.version -le [version]$current){Write-Output '当前安装包无需升级；本地连接有问题请使用更新 / 修复。';return}
if(-not $Apply){Write-Output '点击下载并统一更新继续。';return}
if(Test-Path -LiteralPath (Join-Path $Root '.git')){throw '源码目录请使用 Git 更新，不自动覆盖。'}
$jobs=Join-Path $HostRoot 'video-jobs'
if(Test-Path -LiteralPath $jobs){foreach($file in Get-ChildItem -LiteralPath $jobs -Filter '*.json'){try{$job=Get-Content -LiteralPath $file.FullName -Raw -Encoding UTF8|ConvertFrom-Json}catch{continue};if($job.state -in @('running','queued','downloading','processing')){throw '请先暂停下载任务，再更新。'}}}
$work=Join-Path ([IO.Path]::GetTempPath()) ('chromeget-update-'+[Guid]::NewGuid().ToString('N'));[IO.Directory]::CreateDirectory($work)|Out-Null
$sum=Invoke-WebRequest $release.sumUrl -UseBasicParsing -TimeoutSec 30
$sumText=if($sum.Content -is [byte[]]){[Text.Encoding]::UTF8.GetString($sum.Content)}else{[string]$sum.Content}
$line=@(($sumText -split '\r?\n')|Where-Object {$_ -match ('^[a-fA-F0-9]{64}\s+\*?'+[regex]::Escape($release.name)+'$')})
if($line.Count -ne 1){throw 'SHA256 清单无效'}
. (Join-Path $PSScriptRoot 'setup-download.ps1')
$zip=Join-Path $work $release.name
Receive-VerifiedSetupFile @{url=$release.url;sha256=$line[0].Substring(0,64)} $zip 'Chromeget 更新包'
$stage=Join-Path $work 'package';Expand-ChromegetPackage $zip $stage $release.version
# Preserve native program files for rollback; user JSON, cookies and jobs are never replaced.
$nativeBackup=Join-Path $work 'native-backup';[IO.Directory]::CreateDirectory($nativeBackup)|Out-Null
$oldNames=@();if(Test-Path -LiteralPath $HostRoot){foreach($f in Get-ChildItem -LiteralPath $HostRoot -File|Where-Object Extension -in @('.ps1','.cmd','.cjs','.cs')){$oldNames+=$f.Name;Copy-Item -LiteralPath $f.FullName -Destination $nativeBackup}}
try{Install-ChromegetPackage $stage $Root {
 if(Test-Path -LiteralPath (Join-Path $HostRoot 'host.json')){& (Join-Path $Root 'native\repair.ps1')}
}}catch{
 foreach($f in Get-ChildItem -LiteralPath $HostRoot -File|Where-Object Extension -in @('.ps1','.cmd','.cjs','.cs')){if($f.Name -notin $oldNames){Remove-Item -LiteralPath $f.FullName -Force}}
 foreach($f in Get-ChildItem -LiteralPath $nativeBackup -File){Copy-Item -LiteralPath $f.FullName -Destination (Join-Path $HostRoot $f.Name) -Force}
 throw
}
