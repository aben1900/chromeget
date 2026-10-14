param([string]$ExtensionId,[string]$Directory,[string]$InstallDirectory,[string]$EngineCache,[switch]$SkipRegistration)
$ErrorActionPreference='Stop'
function Get-SetupHash([string]$Path){
    $stream=[IO.File]::OpenRead($Path);$sha=[Security.Cryptography.SHA256]::Create()
    try{return [BitConverter]::ToString($sha.ComputeHash($stream)).Replace('-','')}finally{$stream.Dispose();$sha.Dispose()}
}

try {
    if(-not [Environment]::Is64BitOperatingSystem -or $env:PROCESSOR_ARCHITECTURE -eq 'ARM64'){throw 'This release requires Windows x64.'}
    Write-Host '精彩摘录 - 安装本地保存与下载程序' -ForegroundColor Green
    Write-Host '请先在 chrome://extensions 加载 extension 文件夹，再复制扩展 ID。'
    if(-not $InstallDirectory){$InstallDirectory=Join-Path $env:LOCALAPPDATA 'JingcaiClipper'}
    $InstallDirectory=[IO.Path]::GetFullPath($InstallDirectory)
    $manifestPath=Join-Path $InstallDirectory 'host.json'
    $configPath=Join-Path $InstallDirectory 'config.json'
    $oldManifest=if(Test-Path -LiteralPath $manifestPath){Get-Content -LiteralPath $manifestPath -Raw -Encoding UTF8 | ConvertFrom-Json}else{$null}
    if(-not $ExtensionId){
        $previous=if($oldManifest){[string]$oldManifest.allowed_origins[0] -replace '^chrome-extension://|/$',''}else{''}
        $ExtensionId=(Read-Host "粘贴扩展 ID（回车保留：$previous）").Trim()
        if(-not $ExtensionId){$ExtensionId=$previous}
    }
    if($ExtensionId -cnotmatch '^[a-p]{32}$'){throw '扩展 ID 格式不正确，请复制本台电脑 Chrome 中显示的 32 位 ID。'}
    if(-not $Directory){
        $default=if(Test-Path -LiteralPath $configPath){(Get-Content -LiteralPath $configPath -Raw -Encoding UTF8|ConvertFrom-Json).directory}else{Join-Path ([Environment]::GetFolderPath('MyDocuments')) '精彩摘录'}
        $Directory=(Read-Host "摘录保存目录（回车使用 $default）").Trim().Trim('"')
        if(-not $Directory){$Directory=$default}
    }
    if($Directory -notmatch '^[a-zA-Z]:[\\/]'){throw '保存目录必须是本地磁盘绝对路径，例如 D:\我的摘录。'}
    $Directory=[IO.Path]::GetFullPath($Directory)
    [IO.Directory]::CreateDirectory($Directory)|Out-Null
    $probe=Join-Path $Directory ([Guid]::NewGuid().ToString('N')+'.tmp')
    [IO.File]::WriteAllText($probe,'');[IO.File]::Delete($probe)
    [IO.Directory]::CreateDirectory($InstallDirectory)|Out-Null
    Write-Host '正在准备引擎。首次安装需要联网，请等待；网络中断可重新运行。'
    & (Join-Path (Split-Path $PSScriptRoot -Parent) 'tools\prepare-engines.ps1') -BinDirectory (Join-Path $InstallDirectory 'bin') -CacheDirectory $EngineCache
    foreach($name in @('ai-config-model.cjs','ai-model-discovery.cjs','ai-model-registry.cjs','ai-model-import.cjs','ai-model-import.ps1','ai-provider.cjs','ai-transport.cjs','ai-ccswitch.cjs','ai-runner.cjs','ai-config.ps1','ai.ps1','library-ai.cjs','journal-lock.ps1','library-backup.cjs','library-backup-model.cjs','library.ps1','library.cjs','library-image.cjs','library-export.cjs','library-zip.cjs','diagnostics.ps1','recovery.ps1','host.ps1','host.cmd','video.ps1','gallery-image.ps1','ocr.ps1','gallery-http.cjs','video-worker.ps1','transfer.ps1','telemetry.ps1','transfer-probe.ps1','queue-watch.ps1','range-worker.ps1','range-engine.cs')){
        $source=Join-Path $PSScriptRoot $name;$destination=Join-Path $InstallDirectory $name
        if($source -eq $destination){continue}
        Copy-Item -LiteralPath $source -Destination $destination -Force
        if((Get-SetupHash $source) -ne (Get-SetupHash $destination)){throw "复制校验失败：$name"}
    }
    $translationSource=Join-Path (Split-Path $PSScriptRoot -Parent) 'extension\free-translation.js'
    $translationTarget=Join-Path $InstallDirectory 'free-translation.cjs'
    Copy-Item -LiteralPath $translationSource -Destination $translationTarget -Force
    if((Get-SetupHash $translationSource) -ne (Get-SetupHash $translationTarget)){throw '复制校验失败：free-translation.cjs'}
    Copy-Item -LiteralPath (Join-Path (Split-Path $PSScriptRoot -Parent) 'tools\engines.lock.json') -Destination (Join-Path $InstallDirectory 'engines.lock.json') -Force
    $plugins=Join-Path $PSScriptRoot 'bin\yt-dlp-plugins'
    if((Test-Path -LiteralPath $plugins) -and $PSScriptRoot -ne $InstallDirectory){Copy-Item -LiteralPath $plugins -Destination (Join-Path $InstallDirectory 'bin') -Recurse -Force}
    $utf8=New-Object Text.UTF8Encoding($false)
    [IO.File]::WriteAllText($configPath,(@{directory=$Directory;extensionRoot=(Join-Path (Split-Path $PSScriptRoot -Parent) 'extension')}|ConvertTo-Json),$utf8)
    $origins=@("chrome-extension://$ExtensionId/")
    if($oldManifest){$origins+=@($oldManifest.allowed_origins | Where-Object {$_ -cmatch '^chrome-extension://[a-p]{32}/$'})}
    $manifest=@{name='cn.jingcai.clipper';description='Jingcai local file writer';path=(Join-Path $InstallDirectory 'host.cmd');type='stdio';allowed_origins=@($origins|Select-Object -Unique)}
    [IO.File]::WriteAllText($manifestPath,($manifest|ConvertTo-Json -Depth 5),$utf8)
    if(-not $SkipRegistration){
        foreach($view in @([Microsoft.Win32.RegistryView]::Registry64,[Microsoft.Win32.RegistryView]::Registry32)){
            $base=[Microsoft.Win32.RegistryKey]::OpenBaseKey([Microsoft.Win32.RegistryHive]::CurrentUser,$view)
            try{$key=$base.CreateSubKey('Software\Google\Chrome\NativeMessagingHosts\cn.jingcai.clipper');try{$key.SetValue('',$manifestPath)}finally{$key.Dispose()}}finally{$base.Dispose()}
        }
    }
    Write-Host "安装完成。摘录：$(Join-Path $Directory '摘录数据.json')" -ForegroundColor Green
    Write-Host '请重新加载扩展并重新打开侧栏。后台任务、下载设置和原有资料均保留。'
}catch{Write-Host ('安装失败：'+$_.Exception.Message) -ForegroundColor Red;Write-Host '请暂停下载任务后重试；不要删除个人数据。';exit 1}
