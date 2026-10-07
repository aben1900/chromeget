$ErrorActionPreference='Stop'
$root=Join-Path (Resolve-Path (Join-Path $PSScriptRoot '..')).Path ('work\filter-'+[Guid]::NewGuid().ToString('N'))
[IO.Directory]::CreateDirectory($root)|Out-Null
Copy-Item -LiteralPath (Join-Path $PSScriptRoot '..\native\video.ps1') -Destination $root
. (Join-Path $root 'video.ps1')
$jobs=Join-Path $root 'video-jobs';[IO.Directory]::CreateDirectory($jobs)|Out-Null
$ids=@()
for($i=0;$i -lt 55;$i++){
 $id=[Guid]::NewGuid().ToString('N');$ids+=,$id
 $state=if($i -lt 51){'completed'}else{'failed'}
 Write-VideoJson (Join-Path $jobs ($id+'.json')) @{state=$state;createdAt=([DateTime]'2026-01-01Z').AddMinutes($i).ToUniversalTime().ToString('o');title="task-$i";directory=$root;arguments=@('--continue','https://example.com');file='';error=''}
}
$unfinished=Invoke-VideoAction ([pscustomobject]@{action='video-jobs';statusFilter='unfinished'})
if($unfinished.total -ne 4 -or $unfinished.items[0].title -ne 'task-54'){throw 'Default filtering or descending creation order failed'}
$completed=Invoke-VideoAction ([pscustomobject]@{action='video-jobs';statusFilter='completed';offset=50})
if($completed.total -ne 51 -or $completed.items.Count -ne 1 -or $completed.items[0].title -ne 'task-0'){throw 'Filtering must precede pagination'}
[IO.File]::SetLastWriteTimeUtc((Join-Path $jobs ($ids[0]+'.json')),[DateTime]::UtcNow.AddDays(1))
$all=Invoke-VideoAction ([pscustomobject]@{action='video-jobs';statusFilter='all'})
if($all.items[0].title -ne 'task-54' -or $all.total -ne 55){throw 'Progress writes changed creation order'}
foreach($id in @($ids[0],$ids[54])){Invoke-VideoAction ([pscustomobject]@{action='video-delete';id=$id})|Out-Null}
$all=Invoke-VideoAction ([pscustomobject]@{action='video-jobs';statusFilter='all'})
if($all.total -ne 53){throw 'Completed and failed deletion failed'}
Write-Output 'PASS state filtering, 50-item pagination, creation time descending independent of writes, completed/failed deletion'
