$ErrorActionPreference='Stop'
$root=Split-Path $PSScriptRoot -Parent
$temp=Join-Path ([IO.Path]::GetTempPath()) ('jingcai-companion-install-'+[Guid]::NewGuid().ToString('N'))
$source=Join-Path $temp 'package'
$native=Join-Path $source 'native'
$tools=Join-Path $source 'tools'
$installed=Join-Path $temp 'installed'
$save=Join-Path $temp 'save'
try {
    [IO.Directory]::CreateDirectory($native)|Out-Null
    [IO.Directory]::CreateDirectory($tools)|Out-Null
    [IO.Directory]::CreateDirectory((Join-Path $source 'extension'))|Out-Null
    Get-ChildItem -LiteralPath (Join-Path $root 'native') -File | Where-Object {$_.Extension -in @('.ps1','.cmd','.cs','.cjs')} | ForEach-Object {Copy-Item -LiteralPath $_.FullName -Destination $native}
    Copy-Item -LiteralPath (Join-Path $root 'extension\free-translation.js') -Destination (Join-Path $source 'extension\free-translation.js')
    Copy-Item -LiteralPath (Join-Path $root 'tools\engines.lock.json') -Destination $tools
    Set-Content -LiteralPath (Join-Path $tools 'prepare-engines.ps1') -Value 'param([string]$BinDirectory,[string]$CacheDirectory)' -Encoding UTF8
    & (Join-Path $native 'install.ps1') -ExtensionId ('a'*32) -Directory $save -InstallDirectory $installed -SkipRegistration
    if($LASTEXITCODE){throw 'Temporary installation failed.'}
    $companion=Join-Path $installed 'video-companion.ps1'
    if(-not (Test-Path -LiteralPath $companion -PathType Leaf)){throw 'Temporary installation omitted video-companion.ps1.'}
    . (Join-Path $installed 'video.ps1')
    if(-not (Get-Command New-VideoCompanionDraft -ErrorAction SilentlyContinue)){throw 'Installed video module cannot create companion drafts.'}
    Write-Output 'PASS temporary installation includes video companion support'
}finally{
    $resolved=[IO.Path]::GetFullPath($temp)
    $allowed=[IO.Path]::GetFullPath([IO.Path]::GetTempPath()).TrimEnd('\')+'\'
    if(-not $resolved.StartsWith($allowed,[StringComparison]::OrdinalIgnoreCase) -or [IO.Path]::GetFileName($resolved) -cnotmatch '^jingcai-companion-install-[a-f0-9]{32}$'){throw 'Unsafe test cleanup path.'}
    if(Test-Path -LiteralPath $resolved){Remove-Item -LiteralPath $resolved -Recurse -Force}
}
