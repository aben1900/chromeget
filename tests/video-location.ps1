$ErrorActionPreference='Stop'
$root=Join-Path (Resolve-Path (Join-Path $PSScriptRoot '..')).Path ('work\location-test-'+[Guid]::NewGuid().ToString('N'))
$jobs=Join-Path $root 'video-jobs'
$folder=Join-Path $root 'folder with spaces'
[IO.Directory]::CreateDirectory($jobs)|Out-Null
[IO.Directory]::CreateDirectory($folder)|Out-Null
Copy-Item -LiteralPath (Join-Path $PSScriptRoot '..\native\video.ps1') -Destination (Join-Path $root 'video.ps1')
. (Join-Path $root 'video.ps1')
$rejected=$false;try{Get-RecentVideoLocation $jobs|Out-Null}catch{$rejected=$true}
if(-not $rejected){throw 'Empty jobs not rejected'}
$file=Join-Path $folder 'sample [360p].mp4'
[IO.File]::WriteAllText($file,'fixture')
Write-VideoJson (Join-Path $jobs 'completed.json') @{state='completed';file=$file;directory=$folder}
Write-VideoJson (Join-Path $jobs 'failed.json') @{state='failed';file='';directory=$folder}
$location=Get-RecentVideoLocation $jobs
if($location.file -ne $file -or -not $location.exists){throw 'Did not find latest completed file'}
function Start-Process { param($FilePath,$ArgumentList,$WindowStyle) $script:launch=@{exe=$FilePath;arguments=$ArgumentList;style=$WindowStyle} }
$result=Invoke-VideoAction ([pscustomobject]@{action='video-open-recent'})
if(-not $result.selected -or $launch.arguments -ne ('/select,'+(Quote-VideoArg $file)) -or $launch.exe -notlike '*explorer.exe'){throw 'Explorer select arguments incorrect'}
[IO.File]::Delete($file)
$result=Invoke-VideoAction ([pscustomobject]@{action='video-open-recent'})
if($result.selected -or $launch.arguments -ne (Quote-VideoArg $folder)){throw 'Missing file directory fallback failed'}
Write-Output 'PASS recent completed download, failed-job exclusion, spaced path, Explorer selection, missing-file fallback, empty history'
foreach($state in @('starting','running','failed','completed')){
 $id=[Guid]::NewGuid().ToString('N')
 Write-VideoJson (Join-Path $jobs ($id+'.json')) @{state=$state;file='';directory=$folder}
 $result=Invoke-VideoAction ([pscustomobject]@{action='video-open-task';id=$id})
 if($result.directory -ne $folder -or $launch.arguments -ne (Quote-VideoArg $folder)){throw 'Per-task folder failed'}
}
$galleryFolder=Join-Path $root 'gallery folder';[IO.Directory]::CreateDirectory($galleryFolder)|Out-Null
$id=[Guid]::NewGuid().ToString('N')
Write-VideoJson (Join-Path $jobs ($id+'.json')) @{state='completed';kind='gallery';directory=$galleryFolder}
Invoke-VideoAction ([pscustomobject]@{action='video-open-task';id=$id})|Out-Null
if($launch.arguments -ne (Quote-VideoArg $galleryFolder)){throw 'Gallery did not open its own folder'}
[IO.File]::WriteAllText((Join-Path $jobs ($id+'.json.deleted')),'deleted')
$rejected=$false;try{Invoke-VideoAction ([pscustomobject]@{action='video-open-task';id=$id})|Out-Null}catch{$rejected=$true}
if(-not $rejected){throw 'Deleted task opened'}
Write-Output 'PASS per-task folders for all states, gallery folder and deleted-task rejection'
