param([string]$ExtensionId,[switch]$Unregister,[switch]$Check)
$ErrorActionPreference='Stop'
$manifestPath=Join-Path $PSScriptRoot 'portable-host.json'
$backupPath=Join-Path $PSScriptRoot 'portable-registration.json'
$registryPath='Software\Google\Chrome\NativeMessagingHosts\cn.jingcai.clipper'
if($Check){
    foreach($name in @('journal-lock.ps1','library-backup.cjs','library-backup-model.cjs','library.ps1','library.cjs','library-export.cjs','library-zip.cjs','diagnostics.ps1','recovery.ps1','host.cmd','host.ps1','video.ps1','range-engine.cs','bin\aria2c.exe','bin\yt-dlp.exe','bin\ffmpeg.exe','bin\ffprobe.exe','bin\node.exe')){
        if(-not (Test-Path -LiteralPath (Join-Path $PSScriptRoot $name))){throw ('Missing portable dependency: '+$name)}
    }
    Write-Output 'Portable dependencies present. Registration has not been changed.';exit
}
if($Unregister){
    $key=[Microsoft.Win32.Registry]::CurrentUser.OpenSubKey($registryPath,$true)
    if($key){try{
        if([string]$key.GetValue('') -ne $manifestPath){throw 'Chrome is using another installation; its registration was preserved.'}
        $old=if(Test-Path -LiteralPath $backupPath){Get-Content -LiteralPath $backupPath -Raw -Encoding UTF8|ConvertFrom-Json}else{$null}
        if($old.path -and (Test-Path -LiteralPath $old.path)){$key.SetValue('',$old.path)}else{$key.DeleteValue('',$false)}
    }finally{$key.Dispose()}}
    if(Test-Path -LiteralPath $backupPath){Remove-Item -LiteralPath $backupPath}
    Write-Output 'Portable registration removed; downloaded files and records preserved.';exit
}
& (Join-Path (Split-Path $PSScriptRoot -Parent) 'tools\prepare-engines.ps1') -BinDirectory (Join-Path $PSScriptRoot 'bin')
if(-not $ExtensionId){$ExtensionId=(Read-Host 'Chrome extension ID (from chrome://extensions)').Trim()}
if($ExtensionId -cnotmatch '^[a-p]{32}$'){throw 'Invalid extension ID'}
$utf8=New-Object Text.UTF8Encoding($false)
$config=Join-Path $PSScriptRoot 'config.json'
if(-not (Test-Path -LiteralPath $config)){
    $directory=Join-Path (Split-Path $PSScriptRoot -Parent) 'outputs'
    [IO.Directory]::CreateDirectory($directory)|Out-Null
    [IO.File]::WriteAllText($config,(@{directory=$directory}|ConvertTo-Json),$utf8)
}
if(-not (Test-Path -LiteralPath (Join-Path $PSScriptRoot 'video-settings.json'))){
    [IO.File]::WriteAllText((Join-Path $PSScriptRoot 'video-settings.json'),(@{directory=(Join-Path (Split-Path $PSScriptRoot -Parent) 'downloads');maxActive=3;transferMode='fast'}|ConvertTo-Json),$utf8)
}
$key=[Microsoft.Win32.Registry]::CurrentUser.CreateSubKey($registryPath)
try{
    if([string]$key.GetValue('') -ne $manifestPath){[IO.File]::WriteAllText($backupPath,(@{path=[string]$key.GetValue('')}|ConvertTo-Json),$utf8)}
    $manifest=@{name='cn.jingcai.clipper';description='Jingcai portable host';path=(Join-Path $PSScriptRoot 'host.cmd');type='stdio';allowed_origins=@("chrome-extension://$ExtensionId/")}
    [IO.File]::WriteAllText($manifestPath,($manifest|ConvertTo-Json),$utf8)
    $key.SetValue('',$manifestPath,[Microsoft.Win32.RegistryValueKind]::String)
}finally{$key.Dispose()}
Write-Output 'Portable host registered for this user. Reload the Chrome extension. Register again after moving this folder.'
