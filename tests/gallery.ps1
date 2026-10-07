$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot '..\native\video.ps1')
$root=Join-Path (Resolve-Path (Join-Path $PSScriptRoot '..')).Path ('work\gallery-test-'+[Guid]::NewGuid().ToString('N'))
[IO.Directory]::CreateDirectory($root)|Out-Null
$info=[pscustomobject]@{id='abcdef';title='Test: album';gallery_images=@([pscustomobject]@{url='https://sns-webpic-qc.xhscdn.com/one';width=100;height=200},[pscustomobject]@{url='https://sns-webpic-qc.xhscdn.com/two';width=200;height=100})}
$preview=Save-GalleryPreview $info 'https://www.xiaohongshu.com/explore/abcdef' $root $root
if($preview.images.Count -ne 2 -or $preview.images[0].url -notlike '*one'){throw 'Preview order changed'}
$rejected=$false;try{Start-GalleryJob ([pscustomobject]@{draftId=$preview.draftId;confirmed=$false}) $root $root|Out-Null}catch{$rejected=$true}
if(-not $rejected){throw 'Confirmation was bypassed'}
function Start-Process {param($FilePath,$ArgumentList,$WindowStyle)}
$result=Start-GalleryJob ([pscustomobject]@{draftId=$preview.draftId;confirmed=$true}) $root $root
$job=Read-VideoJson (Join-Path $root ($result.id+'.json'))
if($job.kind -ne 'gallery' -or $job.images.Count -ne 2 -or $job.directory -notlike '*Test_ album*'){throw 'Confirmed batch invalid'}
foreach($bad in @('https://xhscdn.com.evil.com/one','http://xhscdn.com/one','https://user@xhscdn.com/one','file:///C:/one')){
 $rejected=$false;try{Assert-GalleryImage $bad|Out-Null}catch{$rejected=$true};if(-not $rejected){throw 'Unsafe image URL accepted'}
}
Write-Output 'PASS ordered gallery preview, mandatory confirmation, one batch folder, filename sanitation, image host validation'
function New-Object {
 param([string]$TypeName,[object[]]$ArgumentList)
 if($TypeName -eq 'Net.Http.HttpClientHandler'){$o=[pscustomobject]@{AllowAutoRedirect=$true};$o|Add-Member ScriptMethod Dispose {};return $o}
 if($TypeName -eq 'Net.Http.HttpClient'){
  $agent=[pscustomobject]@{};$agent|Add-Member ScriptMethod ParseAdd {}
  $o=[pscustomobject]@{Timeout=$null;DefaultRequestHeaders=[pscustomobject]@{Referrer=$null;UserAgent=$agent}}
  $o|Add-Member ScriptMethod Dispose {}
  $o|Add-Member ScriptMethod GetAsync {
   $content=[pscustomobject]@{};$content|Add-Member ScriptMethod ReadAsByteArrayAsync {
    $task=[pscustomobject]@{};$task|Add-Member ScriptMethod GetAwaiter {return $this};$task|Add-Member ScriptMethod GetResult {return [byte[]]@(255,216,255,224,0,0,0,0,0,0,0,0,255,217)};return $task
   }
   $response=[pscustomobject]@{Content=$content};$response|Add-Member ScriptMethod EnsureSuccessStatusCode {}; $response|Add-Member ScriptMethod Dispose {}
   $task=[pscustomobject]@{Result=$response};$task|Add-Member ScriptMethod GetAwaiter {return $this};$task|Add-Member ScriptMethod GetResult {return $this.Result};return $task
  };return $o
 }
 return Microsoft.PowerShell.Utility\New-Object -TypeName $TypeName -ArgumentList $ArgumentList
}
$jobPath=Join-Path $root ($result.id+'.json')
Invoke-GalleryDownload $job $jobPath (Join-Path $root 'progress.log')
if($job.completedCount -ne 2 -or -not (Test-Path -LiteralPath (Join-Path $job.directory '001.jpg')) -or -not (Test-Path -LiteralPath (Join-Path $job.directory '002.jpg'))){throw 'Batch files missing'}
$metadata=Read-VideoJson (Join-Path $job.directory ([string][char]0x56fe+[char]0x96c6+[char]0x4fe1+[char]0x606f+'.json'))
if($metadata.count -ne 2){throw 'Batch manifest count incorrect'}
Write-Output 'PASS background batch saving with mocked HTTP, numbered images, progress and JSON manifest'
$info.title='Subset'
$preview=Save-GalleryPreview $info 'https://www.xiaohongshu.com/explore/abcdef' $root $root
foreach($selection in @(@(),@(-1),@(2),@(0,0),@('1'))){
 $rejected=$false;try{Start-GalleryJob ([pscustomobject]@{draftId=$preview.draftId;confirmed=$true;selectedIndexes=$selection}) $root $root|Out-Null}catch{$rejected=$true}
 if(-not $rejected){throw 'Invalid selection accepted'}
}
$result=Start-GalleryJob ([pscustomobject]@{draftId=$preview.draftId;confirmed=$true;selectedIndexes=@(1)}) $root $root
$jobPath=Join-Path $root ($result.id+'.json');$job=Read-VideoJson $jobPath
if($job.images.Count -ne 1 -or $job.images[0].originalIndex -ne 2){throw 'Selection not respected'}
Invoke-GalleryDownload $job $jobPath (Join-Path $root 'subset.log')
if((Test-Path -LiteralPath (Join-Path $job.directory '001.jpg')) -or -not (Test-Path -LiteralPath (Join-Path $job.directory '002.jpg'))){throw 'Original index not preserved'}
Write-Output 'PASS subset download, original numbering, empty/duplicate/out-of-range selection rejection'
