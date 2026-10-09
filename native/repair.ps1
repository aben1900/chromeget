$ErrorActionPreference='Stop'
$target=Join-Path $env:LOCALAPPDATA 'JingcaiClipper'
$manifestPath=Join-Path $target 'host.json'
$configPath=Join-Path $target 'config.json'
if(-not(Test-Path -LiteralPath $manifestPath) -or -not(Test-Path -LiteralPath $configPath)){throw 'Existing installation missing; run install.cmd first.'}
$manifest=Get-Content -LiteralPath $manifestPath -Raw -Encoding UTF8|ConvertFrom-Json
$config=Get-Content -LiteralPath $configPath -Raw -Encoding UTF8|ConvertFrom-Json
$id=[string]$manifest.allowed_origins[0] -replace '^chrome-extension://|/$',''
& (Join-Path $PSScriptRoot 'install.ps1') -ExtensionId $id -Directory $config.directory -InstallDirectory $target
