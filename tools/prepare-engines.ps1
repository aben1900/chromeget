param(
    [string]$BinDirectory = (Join-Path (Split-Path $PSScriptRoot -Parent) 'native\bin'),
    [string]$CacheDirectory
)
$ErrorActionPreference='Stop'

[Net.ServicePointManager]::SecurityProtocol=[Net.SecurityProtocolType]::Tls12
$ProgressPreference='SilentlyContinue'
. (Join-Path $PSScriptRoot 'setup-download.ps1')
$lock=Get-Content -LiteralPath (Join-Path $PSScriptRoot 'engines.lock.json') -Raw | ConvertFrom-Json
$BinDirectory=[IO.Path]::GetFullPath($BinDirectory)
[IO.Directory]::CreateDirectory($BinDirectory)|Out-Null
$stage=Join-Path $BinDirectory ('.setup-'+[Guid]::NewGuid().ToString('N'))
[IO.Directory]::CreateDirectory($stage)|Out-Null
try {
    $index=0
    foreach($engine in $lock.engines){
        Assert-SetupNotCancelled
        $index++
        $label='['+$index+'/'+$lock.engines.Count+'] '+$engine.id+' '+$engine.version
        Write-SetupProgress ($label+' · 检查已安装文件')
        $receiptPath=Join-Path $BinDirectory ($engine.id+'-installed.json')
        $ready=$false
        if(Test-Path -LiteralPath $receiptPath){
            try{
                $receipt=Get-Content -LiteralPath $receiptPath -Raw | ConvertFrom-Json
                $ready=($receipt.archiveSha256 -eq $engine.sha256 -and @($receipt.files).Count -eq @($engine.files).Count)
                foreach($file in $engine.files){
                    $entry=@($receipt.files | Where-Object name -eq $file.target)
                    $target=Join-Path $BinDirectory $file.target
                    if($entry.Count -ne 1 -or -not (Test-Path -LiteralPath $target) -or (Get-SetupHash $target) -ne $entry[0].sha256){$ready=$false;break}
                }
            }catch{$ready=$false}
        }
        if($ready){Write-SetupProgress ($label+' · 已校验，无需下载') 100;continue}
        $archive=Join-Path $stage $engine.archive
        $persistentCache=Join-Path (Join-Path $env:LOCALAPPDATA 'JingcaiClipper\setup-cache') ($engine.sha256+'-'+$engine.archive)
        $cached=if($CacheDirectory){Join-Path $CacheDirectory $engine.archive}else{$null}
        if(-not $CacheDirectory){
            $candidates=@($persistentCache)
            if($engine.kind -eq 'exe'){$candidates+=@((Join-Path $BinDirectory $engine.archive),(Join-Path (Split-Path $PSScriptRoot -Parent) ('native\bin\'+$engine.archive)))}
            $cached=$candidates | Where-Object {(Test-Path -LiteralPath $_ -PathType Leaf) -and (Get-SetupHash $_) -eq $engine.sha256} | Select-Object -First 1
        }
        if($cached -and (Test-Path -LiteralPath $cached)){
            Write-SetupProgress ($label+' · 复用本地文件，校验 SHA-256')
            Copy-Item -LiteralPath $cached -Destination $archive
        }else{
            Receive-VerifiedSetupFile $engine $archive $label
        }
        Write-SetupProgress ($label+' · 下载阶段结束，正在校验 SHA-256')
        if((Get-SetupHash $archive) -ne $engine.sha256){throw ('SHA256 mismatch: '+$engine.id+'. Installation stopped; no unverified executable was run.')}
        Assert-SetupNotCancelled
        if(-not $CacheDirectory){
            [IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($persistentCache))|Out-Null
            Copy-Item -LiteralPath $archive -Destination $persistentCache -Force
        }
        $unpacked=Join-Path $stage $engine.id
        Write-SetupProgress ($label+' · 校验通过，正在解压 / 安装')
        if($engine.kind -eq 'zip'){Expand-Archive -LiteralPath $archive -DestinationPath $unpacked}
        $installed=@()
        foreach($file in $engine.files){
            $source=if($engine.kind -eq 'zip'){Join-Path $unpacked $file.source}else{$archive}
            if(-not (Test-Path -LiteralPath $source -PathType Leaf)){throw ('Missing engine file: '+$file.source)}
            $target=Join-Path $BinDirectory $file.target
            Copy-Item -LiteralPath $source -Destination $target -Force
            $hash=(Get-SetupHash $target)
            if($hash -ne (Get-SetupHash $source)){throw 'Installed file verification failed'}
            $installed+=@{name=$file.target;sha256=$hash}
        }
        @{id=$engine.id;version=$engine.version;url=$engine.url;archiveSha256=$engine.sha256;files=$installed} | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $receiptPath -Encoding UTF8
        Write-SetupProgress ($label+' · 安装并校验完成') 100
    }
    Assert-SetupNotCancelled
}finally{
    $resolved=[IO.Path]::GetFullPath($stage)
    if(-not $resolved.StartsWith($BinDirectory.TrimEnd('\')+'\',[StringComparison]::OrdinalIgnoreCase) -or [IO.Path]::GetFileName($resolved) -notmatch '^\.setup-[a-f0-9]{32}$'){throw 'Unsafe cleanup target'}
    Remove-Item -LiteralPath $resolved -Recurse -Force
}
