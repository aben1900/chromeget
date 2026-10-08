$ErrorActionPreference='Stop'
. (Join-Path (Split-Path $PSScriptRoot -Parent) 'tools\setup-download.ps1')
$temp=Join-Path (Split-Path $PSScriptRoot -Parent) ('work\mirror-test-'+[Guid]::NewGuid().ToString('N'))
[IO.Directory]::CreateDirectory($temp)|Out-Null
$file=Join-Path $temp 'engine.bin'
[IO.File]::WriteAllText($file,'good')
$engine=[pscustomobject]@{mirrors=@('https://mirror.example/engine');url='https://official.example/engine';sha256=(Get-SetupHash $file)}
$script:calls=@();$script:mode='error'
function Receive-SetupFile($Url,$Destination,$Label){
    $script:calls+=@($Url)
    if($script:mode -eq 'all-fail'){throw 'offline'}
    if($Url -match 'mirror.example'){
        if($script:mode -eq 'error'){throw 'offline'}
        if($script:mode -eq 'slow'){throw 'below 64 KiB/s'}
        [IO.File]::WriteAllText($Destination,'bad');return
    }
    [IO.File]::WriteAllText($Destination,'good')
}
foreach($mode in @('error','slow','bad-hash')){
    $script:mode=$mode;$script:calls=@()
    Receive-VerifiedSetupFile $engine $file 'test' | Out-Null
    if($script:calls.Count -ne 2 -or $script:calls[0] -ne $engine.mirrors[0] -or $script:calls[1] -ne $engine.url -or (Get-SetupHash $file) -ne $engine.sha256){throw "Fallback failed: $mode"}
}
$script:mode='all-fail';$script:calls=@();$failed=$false
try{Receive-VerifiedSetupFile $engine $file 'test' | Out-Null}catch{$failed=$true}
if(-not $failed -or $script:calls.Count -ne 3){throw 'Retry bound failed'}
$engine.mirrors=@('http://insecure.example/engine');$script:calls=@();$failed=$false
try{Receive-VerifiedSetupFile $engine $file 'test' | Out-Null}catch{$failed=$true}
if(-not $failed -or $script:calls.Count -ne 0){throw 'Insecure source accepted'}
Write-Output 'PASS mirror first; official fallback on errors, slow transfer and hash mismatch; bounded failures; HTTPS required.'
$env:JINGCAI_SETUP_CANCEL_FILE=Join-Path $temp 'cancel'
[IO.File]::WriteAllText($env:JINGCAI_SETUP_CANCEL_FILE,'cancel')
$engine.mirrors=@('https://mirror.example/engine');$script:calls=@();$failed=$false
try{Receive-VerifiedSetupFile $engine $file 'cancel-test' | Out-Null}catch{$failed=$_.Exception.Message -match 'SETUP_CANCELLED'}
if(-not $failed -or $script:calls.Count -ne 0){throw 'Cancelled operation started a download'}
Write-Output 'PASS cancelled preparation stops before starting a download.'
