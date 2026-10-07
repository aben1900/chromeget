param(
    [string]$BinDirectory = (Join-Path (Split-Path $PSScriptRoot -Parent) 'native\bin'),
    [string]$CacheDirectory
)
$ErrorActionPreference='Stop'
function Get-SetupHash([string]$Path){
    $stream=[IO.File]::OpenRead($Path);$sha=[Security.Cryptography.SHA256]::Create()
    try{return [BitConverter]::ToString($sha.ComputeHash($stream)).Replace('-','')}finally{$stream.Dispose();$sha.Dispose()}
}

[Net.ServicePointManager]::SecurityProtocol=[Net.SecurityProtocolType]::Tls12
$ProgressPreference='SilentlyContinue'
$lock=Get-Content -LiteralPath (Join-Path $PSScriptRoot 'engines.lock.json') -Raw | ConvertFrom-Json
$BinDirectory=[IO.Path]::GetFullPath($BinDirectory)
[IO.Directory]::CreateDirectory($BinDirectory)|Out-Null
$stage=Join-Path $BinDirectory ('.setup-'+[Guid]::NewGuid().ToString('N'))
[IO.Directory]::CreateDirectory($stage)|Out-Null
try {
    foreach($engine in $lock.engines){
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
        if($ready){Write-Host ($engine.id+' already verified.');continue}
        $archive=Join-Path $stage $engine.archive
        $cached=if($CacheDirectory){Join-Path $CacheDirectory $engine.archive}else{$null}
        if($cached -and (Test-Path -LiteralPath $cached)){
            Copy-Item -LiteralPath $cached -Destination $archive
        }else{
            Write-Host ('Downloading '+$engine.id+' '+$engine.version+' from '+([uri]$engine.url).Host+' ...')
            for($attempt=1;$attempt -le 3;$attempt++){
                try{
                    $aria=Join-Path $BinDirectory 'aria2c.exe'
                    if($engine.id -eq 'ffmpeg' -and (Test-Path -LiteralPath $aria)){
                        & $aria ('--dir='+$stage) ('--out='+$engine.archive) '--continue=true' '--allow-overwrite=true' '--auto-file-renaming=false' '--split=16' '--max-connection-per-server=16' '--min-split-size=4M' '--max-tries=3' '--connect-timeout=30' '--timeout=60' '--summary-interval=15' '--enable-color=false' '--console-log-level=warn' $engine.url
                        if($LASTEXITCODE -ne 0){throw ('Download exited with code '+$LASTEXITCODE)}
                    }else{Invoke-WebRequest -UseBasicParsing -Uri $engine.url -OutFile $archive -TimeoutSec 1800}
                    break
                }
                catch{if($attempt -eq 3){throw};Write-Host ('Retry '+$attempt+' / 3');Start-Sleep -Seconds 2}
            }
        }
        if((Get-SetupHash $archive) -ne $engine.sha256){throw ('SHA256 mismatch: '+$engine.id+'. Installation stopped; no unverified executable was run.')}
        $unpacked=Join-Path $stage $engine.id
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
        Write-Host ($engine.id+' installed and verified.')
    }
}finally{
    $resolved=[IO.Path]::GetFullPath($stage)
    if(-not $resolved.StartsWith($BinDirectory.TrimEnd('\')+'\',[StringComparison]::OrdinalIgnoreCase) -or [IO.Path]::GetFileName($resolved) -notmatch '^\.setup-[a-f0-9]{32}$'){throw 'Unsafe cleanup target'}
    Remove-Item -LiteralPath $resolved -Recurse -Force
}
