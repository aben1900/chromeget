param([string]$JobId,[string]$HostRoot,[switch]$FunctionsOnly)
$ErrorActionPreference='Stop'

function Move-VideoCompanionIntoFolder([string]$jobPath,[scriptblock]$refresh){
    $id=[IO.Path]::GetFileNameWithoutExtension($jobPath)
    if($id -cnotmatch '^[a-f0-9]{32}$'){throw '任务编号无效。'}
    $original=Read-VideoJson $jobPath
    if($original.state -ne 'completed' -or -not $original.companion){throw '只能整理已完成且含配套图文的视频。'}
    if($original.fileLayout -eq 'video-folder-v1'){return Flatten-VideoCompanionFolder $jobPath $refresh}
    $job=Read-VideoJson $jobPath
    $base=[IO.Path]::GetFullPath([string]$job.directory).TrimEnd('\','/')
    $media=[IO.Path]::GetFullPath([string]$job.file)
    if([IO.Path]::GetDirectoryName($media) -cne $base -or -not (Test-Path -LiteralPath $media -PathType Leaf)){throw '旧视频不在任务保存目录的顶层。'}
    Assert-CompanionNoLinks $media
    $stem=[IO.Path]::GetFileNameWithoutExtension($media)
    $shortStem=$stem.Substring(0,[Math]::Min(60,$stem.Length))
    $oldFolder=Join-Path $base ($shortStem+'-'+$id.Substring(0,8)+'-配套资料')
    $files=@($job.companion.files)
    if(-not $files.Count -or -not (Test-Path -LiteralPath $oldFolder -PathType Container)){throw '旧配套资料目录不存在。'}
    Assert-CompanionNoLinks $oldFolder
    foreach($file in $files){
        $path=[IO.Path]::GetFullPath([string]$file)
        if([IO.Path]::GetDirectoryName($path) -cne $oldFolder -or -not (Test-Path -LiteralPath $path -PathType Leaf)){throw '配套文件缺失或不在原目录。'}
        Assert-CompanionNoLinks $path
    }
    $folder=Join-Path $base ($shortStem+' - '+$id.Substring(0,8))
    $newMedia=Join-Path $folder ([IO.Path]::GetFileName($media))
    if([IO.Path]::GetDirectoryName([IO.Path]::GetFullPath($folder)) -cne $base -or (Test-Path -LiteralPath $folder)){throw '目标目录已存在或不在保存目录内。'}
    foreach($file in $files){if([IO.Path]::GetFileName([string]$file) -ceq [IO.Path]::GetFileName($media)){throw '配套文件与视频文件同名。'}}
    $mediaMoved=$false;$companionMoved=$false;$jobUpdated=$false
    try{
        [IO.Directory]::CreateDirectory($folder)|Out-Null
        Move-Item -LiteralPath $media -Destination $newMedia
        $mediaMoved=$true
        $newCompanion=Join-Path $folder '配套资料'
        Move-Item -LiteralPath $oldFolder -Destination $newCompanion
        $companionMoved=$true
        foreach($file in $files){Move-Item -LiteralPath (Join-Path $newCompanion ([IO.Path]::GetFileName([string]$file))) -Destination (Join-Path $folder ([IO.Path]::GetFileName([string]$file)))}
        Remove-Item -LiteralPath $newCompanion
        $job.file=$newMedia
        $job|Add-Member -NotePropertyName fileLayout -NotePropertyValue 'video-folder-v1' -Force
        $job.companion.files=@($files|ForEach-Object{Join-Path $folder ([IO.Path]::GetFileName([string]$_))})
        foreach($image in @($job.companion.images)){
            if($image.savedPath){$image.savedPath=Join-Path $folder ([IO.Path]::GetFileName([string]$image.savedPath))}
        }
        Write-VideoJson $jobPath $job
        $jobUpdated=$true
        $refreshed=& $refresh $id
        if($null -ne $refreshed -and $refreshed.ok -eq $false){throw '资料库索引未能更新。'}
        return @{folder=$folder;already=$false}
    }catch{
        $failure=$_
        if($jobUpdated){Write-VideoJson $jobPath $original}
        if($companionMoved){
            if(-not (Test-Path -LiteralPath $newCompanion)){[IO.Directory]::CreateDirectory($newCompanion)|Out-Null}
            foreach($file in $files){$name=[IO.Path]::GetFileName([string]$file);$moved=Join-Path $folder $name;if(Test-Path -LiteralPath $moved){Move-Item -LiteralPath $moved -Destination (Join-Path $newCompanion $name)}}
            Move-Item -LiteralPath $newCompanion -Destination $oldFolder
        }
        if($mediaMoved){Move-Item -LiteralPath $newMedia -Destination $media}
        if((Test-Path -LiteralPath $folder) -and -not (Get-ChildItem -LiteralPath $folder -Force|Select-Object -First 1)){Remove-Item -LiteralPath $folder -Force}
        throw $failure
    }
}

function Flatten-VideoCompanionFolder([string]$jobPath,[scriptblock]$refresh){
    $id=[IO.Path]::GetFileNameWithoutExtension($jobPath)
    if($id -cnotmatch '^[a-f0-9]{32}$'){throw '任务编号无效。'}
    $original=Read-VideoJson $jobPath
    if($original.state -ne 'completed' -or $original.fileLayout -ne 'video-folder-v1' -or -not $original.companion){throw '只能整理已完成且含配套图文的视频。'}
    $media=[IO.Path]::GetFullPath([string]$original.file)
    $folder=[IO.Path]::GetDirectoryName($media)
    $nested=Join-Path $folder '配套资料'
    if(-not (Test-Path -LiteralPath $nested -PathType Container)){return @{folder=$folder;already=$true}}
    Assert-CompanionNoLinks $nested
    $files=@($original.companion.files)
    if(-not $files.Count){throw '配套文件清单为空，不能整理。'}
    foreach($file in $files){
        $path=[IO.Path]::GetFullPath([string]$file)
        if([IO.Path]::GetDirectoryName($path) -cne $nested -or -not (Test-Path -LiteralPath $path -PathType Leaf)){throw '配套文件缺失或不在原目录。'}
        Assert-CompanionNoLinks $path
        if(Test-Path -LiteralPath (Join-Path $folder ([IO.Path]::GetFileName($path)))){throw '视频目录内存在同名文件，未整理。'}
    }
    $job=Read-VideoJson $jobPath;$moved=@();$jobUpdated=$false
    try{
        foreach($file in $files){$target=Join-Path $folder ([IO.Path]::GetFileName([string]$file));Move-Item -LiteralPath $file -Destination $target;$moved+=,$target}
        if(Get-ChildItem -LiteralPath $nested -Force|Select-Object -First 1){throw '配套资料目录还有未记录的文件，未删除。'}
        $job.companion.files=@($moved)
        foreach($image in @($job.companion.images)){if($image.savedPath){$image.savedPath=Join-Path $folder ([IO.Path]::GetFileName([string]$image.savedPath))}}
        Write-VideoJson $jobPath $job;$jobUpdated=$true
        $refreshed=& $refresh $id
        if($null -ne $refreshed -and $refreshed.ok -eq $false){throw '资料库索引未能更新。'}
        Remove-Item -LiteralPath $nested
        return @{folder=$folder;already=$false}
    }catch{
        $failure=$_
        if($jobUpdated){Write-VideoJson $jobPath $original}
        foreach($path in $moved){if(Test-Path -LiteralPath $path){Move-Item -LiteralPath $path -Destination (Join-Path $nested ([IO.Path]::GetFileName($path)))}}
        throw $failure
    }
}

if($FunctionsOnly){return}
if($JobId -cnotmatch '^[a-f0-9]{32}$'){throw '请提供有效任务编号。'}
if(-not $HostRoot){$HostRoot=Join-Path $env:LOCALAPPDATA 'JingcaiClipper'}
$HostRoot=[IO.Path]::GetFullPath($HostRoot)
. (Join-Path $HostRoot 'video.ps1')
. (Join-Path $HostRoot 'library.ps1')
$config=Read-VideoJson (Join-Path $HostRoot 'config.json')
$result=Move-VideoCompanionIntoFolder (Join-Path (Join-Path $HostRoot 'video-jobs') ($JobId+'.json')) {param($id) Invoke-LibraryAction ([pscustomobject]@{action='library-refresh-download';id=$id}) $config.directory}
Write-Output $(if($result.already){'任务已经整理：'+$result.folder}else{'已整理视频与配套资料：'+$result.folder})
