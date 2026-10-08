# Windows PowerShell 5.1 bootstrap: no external download engine required.
function Get-SetupHash([string]$Path){
    $stream=[IO.File]::OpenRead($Path);$sha=[Security.Cryptography.SHA256]::Create()
    try{return [BitConverter]::ToString($sha.ComputeHash($stream)).Replace('-','')}finally{$stream.Dispose();$sha.Dispose()}
}
function Assert-SetupNotCancelled{
    if($env:JINGCAI_SETUP_CANCEL_FILE -and (Test-Path -LiteralPath $env:JINGCAI_SETUP_CANCEL_FILE)){throw 'SETUP_CANCELLED: 用户已取消安装准备。'}
}
function Receive-VerifiedSetupFile($Engine,[string]$Destination,[string]$Label){
    $sources=@(@($Engine.mirrors)+@($Engine.url) | Where-Object {$_} | Select-Object -Unique)
    foreach($source in $sources){
        $uri=[Uri]$source
        if($uri.Scheme -ne 'https' -or $uri.UserInfo){throw '安装下载源必须为不带凭据的 HTTPS 固定地址。'}
    }
    $tries=[Math]::Max(3,$sources.Count)
    for($attempt=0;$attempt -lt $tries;$attempt++){
        Assert-SetupNotCancelled
        $source=$sources[$attempt % $sources.Count]
        Write-SetupProgress ($Label+' · 下载源 '+([uri]$source).Host+' · 尝试 '+($attempt+1)+'/'+$tries)
        try{
            Receive-SetupFile $source $Destination ($Label+' · '+([uri]$source).Host)
            Write-SetupProgress ($Label+' · 校验下载文件 SHA-256')
            if((Get-SetupHash $Destination) -ne $Engine.sha256){throw 'SHA256 mismatch：下载文件与锁定版本不一致。'}
            return
        }catch{
            Assert-SetupNotCancelled
            if($attempt -eq $tries-1){throw}
            $reason=if($_.Exception.Message -match 'SHA256 mismatch'){'文件校验失败'}elseif($_.Exception.Message -match '64 KiB/s'){'下载持续低速'}else{'连接失败、超时或下载不完整'}
            Write-SetupProgress ($Label+' · '+$reason+'，切换下载源或重试；请检查网络或 Clash 分流。')
        }
    }
}
function Write-SetupProgress([string]$Message,[int]$Percent=-1){
    Write-Output ('JINGCAI_PROGRESS|'+$Percent+'|'+$Message.Replace("`r",' ').Replace("`n",' '))
}
function Receive-SetupFile([string]$Url,[string]$Destination,[string]$Label){
    Assert-SetupNotCancelled
    if(-not ('JingcaiSetupDownload' -as [type])){
        Add-Type -Path (Join-Path $PSScriptRoot 'setup-download.cs') -IgnoreWarnings -WarningAction SilentlyContinue -ErrorAction Stop
    }
    $proxy=[Net.WebRequest]::GetSystemWebProxy()
    $proxyText='Windows 系统代理设置（TUN 分流由 Clash 决定）'
    $configured=if($env:HTTPS_PROXY){$env:HTTPS_PROXY}elseif($env:ALL_PROXY){$env:ALL_PROXY}else{$null}
    if($configured){
        $uri=$null
        if(-not [Uri]::TryCreate($configured,[UriKind]::Absolute,[ref]$uri) -or $uri.Scheme -ne 'http'){
            throw '安装器代理环境变量需使用 HTTP 代理地址；可改用 Clash 的 HTTP/mixed 端口，或清除该变量后使用系统代理。'
        }
        $proxy=New-Object Net.WebProxy($uri.GetLeftPart([UriPartial]::Authority))
        if($uri.UserInfo){$parts=$uri.UserInfo.Split(':',2);$proxy.Credentials=New-Object Net.NetworkCredential([Uri]::UnescapeDataString($parts[0]),$(if($parts.Count -gt 1){[Uri]::UnescapeDataString($parts[1])}else{''}))}
        $proxyText='HTTPS_PROXY / ALL_PROXY 环境变量'
    }
    Write-SetupProgress ($Label+' · 连接中 · '+$proxyText)
    [JingcaiSetupDownload]::Download($Url,$Destination,$Label,$proxy)
}
