function Get-NativeRegistrationPaths {
    $paths=@()
    foreach($view in @([Microsoft.Win32.RegistryView]::Registry64,[Microsoft.Win32.RegistryView]::Registry32)){
        $base=$null;$key=$null
        try{$base=[Microsoft.Win32.RegistryKey]::OpenBaseKey([Microsoft.Win32.RegistryHive]::CurrentUser,$view);$key=$base.OpenSubKey('Software\Google\Chrome\NativeMessagingHosts\cn.jingcai.clipper');if($key){$paths+=[string]$key.GetValue('')}}finally{if($key){$key.Dispose()};if($base){$base.Dispose()}}
    }
    return @($paths|Where-Object{$_}|Select-Object -Unique)
}
function Get-SetupDiagnostics {
    param([string]$HostRoot,[string]$ExpectedExtensionId,[string[]]$RegistrationPaths,[switch]$FullIntegrity,[switch]$ConnectedHost)
    $checks=New-Object Collections.Generic.List[object]
    if(-not $PSBoundParameters.ContainsKey('RegistrationPaths')){$RegistrationPaths=@(Get-NativeRegistrationPaths)}
    $paths=@($RegistrationPaths|Where-Object{$_}|Select-Object -Unique)
    $checks.Add(@{id='registration';state=$(if($paths.Count -eq 1){'pass'}else{'fail'});message=$(if($paths.Count -eq 1){'本地通信已注册'}elseif($paths.Count -gt 1){'检测到冲突注册，请在管理中心修复'}else{'尚未注册，请先安装'})})
    $manifest=$null
    if($paths.Count -eq 1){
        try{
            $manifest=Get-Content -LiteralPath $paths[0] -Raw -Encoding UTF8|ConvertFrom-Json
            if($manifest.name -ne 'cn.jingcai.clipper' -or $manifest.type -ne 'stdio' -or -not [IO.Path]::IsPathRooted($manifest.path) -or -not(Test-Path -LiteralPath $manifest.path -PathType Leaf) -or [IO.Path]::GetFileName($manifest.path) -ine 'host.cmd'){throw 'Invalid registered launcher'}
            $registeredRoot=Split-Path ([IO.Path]::GetFullPath($manifest.path)) -Parent
            if($ConnectedHost){
                if($registeredRoot.TrimEnd('\') -ine ([IO.Path]::GetFullPath($HostRoot)).TrimEnd('\')){throw 'Connected host differs from registration'}
            }else{$HostRoot=$registeredRoot}
            $checks.Add(@{id='manifest';state='pass';message='注册启动文件有效，与当前程序匹配'})
        }catch{$checks.Add(@{id='manifest';state='fail';message='注册启动文件失效或与实际连接的程序不同，请修复并重新打开侧栏'})}
    }
    $hostReady=(Test-Path -LiteralPath ([IO.Path]::Combine($HostRoot,'host.ps1')) -PathType Leaf) -and (Test-Path -LiteralPath ([IO.Path]::Combine($HostRoot,'host.cmd')) -PathType Leaf)
    $checks.Add(@{id='host';state=$(if($hostReady){'pass'}else{'fail'});message=$(if($hostReady){'本地程序文件存在'}else{'未找到完整的本地程序'})})
    $idReady=$ExpectedExtensionId -cmatch '^[a-p]{32}$' -and $manifest -and (@($manifest.allowed_origins) -ccontains ('chrome-extension://'+$ExpectedExtensionId+'/'))
    $checks.Add(@{id='extension';state=$(if($idReady){'pass'}elseif(-not $ExpectedExtensionId){'pending'}else{'fail'});message=$(if($idReady){'扩展 ID 与注册匹配'}elseif(-not $ExpectedExtensionId){'填写扩展 ID 后检查'}else{'扩展 ID 未匹配，请粘贴当前 Chrome 的 ID 后安装'})})
    $probe=$null
    try{
        $config=Get-Content -LiteralPath ([IO.Path]::Combine($HostRoot,'config.json')) -Raw -Encoding UTF8|ConvertFrom-Json
        if(-not(Test-Path -LiteralPath $config.directory -PathType Container)){throw 'Missing directory'}
        $probe=Join-Path $config.directory ('chromeget-check-'+[guid]::NewGuid().ToString('N')+'.tmp')
        $stream=[IO.File]::Open($probe,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::None);$stream.Dispose()
        $checks.Add(@{id='directory';state='pass';message='摘录目录可写'})
    }catch{$checks.Add(@{id='directory';state='fail';message='摘录目录不可写或配置缺失，请在管理中心选择目录'})}
    finally{if($probe -and [IO.File]::Exists($probe)){[IO.File]::Delete($probe)}}
    $bin=[IO.Path]::Combine($HostRoot,'bin');$missing=@('node.exe','yt-dlp.exe','aria2c.exe','ffmpeg.exe','ffprobe.exe')|Where-Object{-not(Test-Path -LiteralPath ([IO.Path]::Combine($bin,$_)) -PathType Leaf)}
    $checks.Add(@{id='engines';state=$(if(@($missing).Count){'fail'}else{'pass'});message=$(if(@($missing).Count){'引擎需要修复：'+($missing -join '、')}else{'引擎文件齐全'})})
    $integrity='pending';$integrityMessage='完整性尚未检查，点击完整校验'
    if($FullIntegrity){
        try{
            $lockPath=Join-Path $HostRoot 'engines.lock.json'
            if(-not(Test-Path -LiteralPath $lockPath)){$lockPath=Join-Path (Split-Path $HostRoot -Parent) 'tools\engines.lock.json'}
            $lock=Get-Content -LiteralPath $lockPath -Raw -Encoding UTF8|ConvertFrom-Json
            if(@($lock.engines).Count -ne 4){throw 'Missing engine policy'}
            foreach($engine in $lock.engines){
                $receipt=Get-Content -LiteralPath (Join-Path $bin ($engine.id+'-installed.json')) -Raw -Encoding UTF8|ConvertFrom-Json
                if($receipt.archiveSha256 -ne $engine.sha256){throw 'Receipt version mismatch'}
                foreach($file in $engine.files){
                    if($file.target -match '[\\/]' -or $file.target -eq '..'){throw 'Invalid file name'}
                    $entry=@($receipt.files|Where-Object name -eq $file.target)
                    if($entry.Count -ne 1 -or $entry[0].sha256 -notmatch '^[a-fA-F0-9]{64}$'){throw 'Invalid receipt'}
                    $actual=(Get-FileHash -LiteralPath (Join-Path $bin $file.target) -Algorithm SHA256).Hash
                    if($actual -ne $entry[0].sha256 -or ($engine.kind -eq 'exe' -and $actual -ne $engine.sha256)){throw 'File changed'}
                }
            }
            $integrity='pass';$integrityMessage='文件与固定版本安装记录一致（本地完整性检查）'
        }catch{$integrity='fail';$integrityMessage='完整性校验未通过或缺少安装记录，请更新 / 修复'}
    }
    $checks.Add(@{id='integrity';state=$integrity;message=$integrityMessage})
    $checks.Add(@{id='browser';state='pending';message='请在 Chrome 扩展中验证实际连接'})
    return @{ok=$true;checks=@($checks.ToArray());hostVersion='1.27.1';capabilities=@('setup-diagnostics','structured-errors')}
}
