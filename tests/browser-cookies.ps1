$ErrorActionPreference='Stop'
$root=Join-Path (Resolve-Path (Join-Path $PSScriptRoot '..')).Path ('work\cookies-test-'+[Guid]::NewGuid().ToString('N'))
[IO.Directory]::CreateDirectory($root)|Out-Null
Copy-Item -LiteralPath (Join-Path $PSScriptRoot '..\native\video.ps1') -Destination (Join-Path $root 'video.ps1')
Copy-Item -LiteralPath (Join-Path $PSScriptRoot '..\native\gallery-image.ps1') -Destination $root
Copy-Item -LiteralPath (Join-Path $PSScriptRoot '..\native\video-companion.ps1') -Destination $root
. (Join-Path $root 'video.ps1')
$text="# Netscape HTTP Cookie File`n#HttpOnly_.bilibili.com`tTRUE`t/`tTRUE`t0`tSESSDATA`tsynthetic`n"
$result=Invoke-VideoAction ([pscustomobject]@{action='video-browser-cookies';cookieText=$text})
$settings=Get-VideoSettings
if(-not $result.ok -or [IO.File]::ReadAllText($settings.cookies) -ne $text){throw 'Import failed'}
foreach($bad in @($text.Replace('.bilibili.com','.example.com'),$text.Replace('SESSDATA','other'))){
 $rejected=$false;try{Invoke-VideoAction ([pscustomobject]@{action='video-browser-cookies';cookieText=$bad})|Out-Null}catch{$rejected=$true}
 if(-not $rejected){throw 'Invalid cookie accepted'}
 if([IO.File]::ReadAllText($settings.cookies) -ne $text){throw 'Invalid import changed existing login'}
}
Invoke-VideoAction ([pscustomobject]@{action='video-clear-cookies'})|Out-Null
if((Get-VideoSettings).cookies -or (Test-Path -LiteralPath $settings.cookies)){throw 'Clear failed'}
Write-Output 'PASS native cookie import, persistence, domain/login validation, preserving prior login on failure, clear'
