param([switch]$PublicRelease)
$ErrorActionPreference='Stop'
$root=Split-Path $PSScriptRoot -Parent
$node=Join-Path $root 'native\bin\node.exe'
if(-not(Test-Path -LiteralPath $node)){$node=(Get-Command node -ErrorAction Stop).Source}
& $node (Join-Path $PSScriptRoot 'build-showcase.cjs')
if($LASTEXITCODE){throw 'Feature page build failed; package not updated.'}
$stage=Join-Path $root ('work\release-'+[Guid]::NewGuid().ToString('N'))
[IO.Directory]::CreateDirectory($stage)|Out-Null
try{
    $names=@('extension','tests','tools','showcase','AGENTS.md','README.md','LICENSE','PRIVACY.md','THIRD_PARTY_NOTICES.md','开始使用.cmd','使用说明.md','功能介绍.html')
    foreach($name in $names){Copy-Item -LiteralPath (Join-Path $root $name) -Destination $stage -Recurse -Force}
    $nativeStage=Join-Path $stage 'native';[IO.Directory]::CreateDirectory($nativeStage)|Out-Null
    Get-ChildItem -LiteralPath (Join-Path $root 'native') -File | Where-Object {$_.Extension -in @('.ps1','.cmd','.cs','.cjs')} | ForEach-Object {Copy-Item -LiteralPath $_.FullName -Destination $nativeStage}
    if($PublicRelease){
        $plugin=Join-Path $nativeStage 'bin\yt-dlp-plugins\jingcai\yt_dlp_plugins\extractor'
        [IO.Directory]::CreateDirectory($plugin)|Out-Null
        Copy-Item -LiteralPath (Join-Path $root 'native\bin\yt-dlp-plugins\jingcai\yt_dlp_plugins\extractor\xhs_gallery.py') -Destination $plugin
    }else{Copy-Item -LiteralPath (Join-Path $root 'native\bin') -Destination $nativeStage -Recurse}
    $zip=Join-Path $root '精彩摘录-Chrome插件-Windows.zip'
    if($PublicRelease){
        $version=(Get-Content -LiteralPath (Join-Path $root 'extension\manifest.json') -Raw -Encoding UTF8|ConvertFrom-Json).version
        $dist=Join-Path $root 'dist';[IO.Directory]::CreateDirectory($dist)|Out-Null
        $zip=Join-Path $dist ('chromeget-v'+$version+'-windows-x64-setup.zip')
        $forbidden=Get-ChildItem -LiteralPath $stage -Recurse -File | Where-Object {$_.Extension -in @('.exe','.dll','.log','.zip') -or $_.Name -match '(jingcai-backup|jingcai-restore|^selection-|^preview-|^receipt-)' -or $_.Name -match '^(ai-settings|config|host|video-settings|portable-host|portable-registration)\.json$'}
        if($forbidden){throw 'Unexpected private/runtime file in public package'}
    }
    Compress-Archive -LiteralPath @((Get-ChildItem -LiteralPath $stage).FullName) -DestinationPath $zip -Force
    if($PublicRelease){
        $sum=(Get-FileHash -LiteralPath $zip -Algorithm SHA256).Hash.ToLower()+'  '+[IO.Path]::GetFileName($zip)
        [IO.File]::WriteAllText((Join-Path $dist 'SHA256SUMS.txt'),$sum+[Environment]::NewLine,(New-Object Text.UTF8Encoding($false)))
        Write-Output $zip
    }
}finally{
    $resolved=[IO.Path]::GetFullPath($stage)
    $allowed=[IO.Path]::GetFullPath((Join-Path $root 'work')).TrimEnd('\')+'\'
    if(-not $resolved.StartsWith($allowed,[StringComparison]::OrdinalIgnoreCase) -or [IO.Path]::GetFileName($resolved) -notmatch '^release-[a-f0-9]{32}$'){throw 'Unsafe staging path; cleanup skipped.'}
    Remove-Item -LiteralPath $resolved -Recurse -Force
}
Write-Output 'Feature page and package updated together.'
