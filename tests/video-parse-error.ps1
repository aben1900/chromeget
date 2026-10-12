$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot '..\native\video.ps1')
$message=Get-VideoParseError 'xiaohongshu' 'ERROR: HTTP Error 403: Forbidden'
if($message -notmatch 'HTTP Error 403' -or $message -notmatch '小红书'){throw 'XHS error lost the actual engine failure'}
if((Get-VideoParseError 'xiaohongshu' '') -notmatch '未返回具体原因'){throw 'Empty engine error needs an honest explanation'}
if((Get-VideoParseError 'xiaohongshu' ('a'*10000)).Length -gt 6500){throw 'Error text must be bounded'}
if((Get-VideoParseError 'youtube' 'connection timed out') -notmatch 'connection timed out'){throw 'Other platform errors must remain available'}
Write-Output 'PASS original engine reason retained, empty reason explicit and diagnostic size bounded'
