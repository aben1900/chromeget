param([string]$JobPath,[int]$Connections=64)
$ErrorActionPreference='Stop'
try{
    . (Join-Path $PSScriptRoot 'video.ps1')
    $job=Read-VideoJson $JobPath
    $urls=@([IO.File]::ReadLines((@($job.arguments|Where-Object{$_ -like '--input-file=*'})[0]).Substring(13))|Where-Object{$_ -match '^https?://'})
    $files=@();[long]$needed=0;[long]$mergeSpace=0
    for($i=0;$i -lt $job.expectedFiles.Count;$i++){
        $probe=$job.probes[$i];$size=[long]$job.expectedSizes[$i]
        if(-not $probe.rangeSupported -or $size -le 0){throw 'Range download unavailable'}
        $output=[string]$job.expectedFiles[$i];$partsDirectory=$output+'.jcparts'
        $hasReceipt=(Test-Path -LiteralPath (Join-Path $partsDirectory 'complete.sha256')) -and (Test-Path -LiteralPath $output)
        if(-not $hasReceipt){
            [long]$saved=0
            if(Test-Path -LiteralPath $partsDirectory){foreach($part in @(Get-ChildItem -LiteralPath $partsDirectory -File|Where-Object{$_.Name -match '^\d{4}\.part$'})){$saved+=$part.Length}}
            $needed += [Math]::Max([long]0,($size-$saved));$mergeSpace=[Math]::Max($mergeSpace,$size)
        }
        $files+=@{Url=$urls[$i];Path=$job.expectedFiles[$i];Size=$size;ETag=$probe.etag;Modified=$probe.lastModified;Sha256=$job.transferFiles[$i].sha256}
    }
    $drive=New-Object IO.DriveInfo([IO.Path]::GetPathRoot($job.directory))
    if($drive.AvailableFreeSpace -lt ($needed+$mergeSpace)){throw '64-way download requires free space for parts and assembly. Use a different directory or compatibility mode.'}
    Add-Type -Path (Join-Path $PSScriptRoot 'range-engine.cs') -ReferencedAssemblies @('System.Web.Extensions','System.Core')
    [JingcaiRanges]::Run((@{Files=$files;Metrics=($JobPath.Substring(0,$JobPath.Length-5)+'.metrics.json');JobPath=$JobPath;Connections=$Connections}|ConvertTo-Json -Depth 8 -Compress))
}catch{$failure=$_.Exception;while($failure.InnerException){$failure=$failure.InnerException};Write-Output ('ERROR: '+$failure.Message);exit 1}
