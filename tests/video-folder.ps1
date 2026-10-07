$ErrorActionPreference='Stop'
$root=Join-Path (Resolve-Path (Join-Path $PSScriptRoot '..')).Path ('work\folder-test-'+[Guid]::NewGuid().ToString('N'))
[IO.Directory]::CreateDirectory($root)|Out-Null
$module=Join-Path $root 'video.ps1'
Copy-Item -LiteralPath (Join-Path $PSScriptRoot '..\native\video.ps1') -Destination $module
. $module
$directory=Join-Path $root 'folder with spaces'
$result=Invoke-VideoAction ([pscustomobject]@{action='video-set-folder';directory=$directory})
if(-not $result.ok -or $result.directory -ne $directory -or -not (Test-Path -LiteralPath $directory)){throw 'Directory was not saved'}
$settings=Read-VideoJson (Join-Path $root 'video-settings.json')
if($settings.directory -ne $directory){throw 'Directory was not persisted'}
foreach($bad in @('relative','https://example.com','')){
 $rejected=$false;try{Invoke-VideoAction ([pscustomobject]@{action='video-set-folder';directory=$bad})|Out-Null}catch{$rejected=$true}
 if(-not $rejected){throw 'Bad directory accepted'}
}
if((Get-ChildItem -LiteralPath $directory -Force).Count){throw 'Probe file was not cleaned up'}
Write-Output 'PASS explicit folder action, path with spaces, persistence, invalid paths, writable-directory probe'
