function Invoke-AiNode($payload) {
    $node=Join-Path $PSScriptRoot 'bin\node.exe'
    if(-not(Test-Path -LiteralPath $node)){$node=(Get-Command node.exe -ErrorAction Stop).Source}
    $info=New-Object Diagnostics.ProcessStartInfo
    $info.FileName=$node;$info.Arguments='"'+(Join-Path $PSScriptRoot 'ai-runner.cjs')+'"'
    $info.UseShellExecute=$false;$info.CreateNoWindow=$true
    $info.RedirectStandardInput=$true;$info.RedirectStandardOutput=$true;$info.RedirectStandardError=$true
    $encoding=New-Object Text.UTF8Encoding($false)
    $info.StandardOutputEncoding=$encoding;$info.StandardErrorEncoding=$encoding
    $process=New-Object Diagnostics.Process;$process.StartInfo=$info
    try {
        [void]$process.Start();$output=$process.StandardOutput.ReadToEndAsync();$errors=$process.StandardError.ReadToEndAsync()
        $bytes=$encoding.GetBytes((ConvertTo-Json -InputObject $payload -Depth 16 -Compress))
        try{$process.StandardInput.BaseStream.Write($bytes,0,$bytes.Length)}finally{[Array]::Clear($bytes,0,$bytes.Length)}
        $process.StandardInput.Close()
        if(-not $process.WaitForExit(55000)){$process.Kill();throw 'NETWORK_TIMEOUT'}
        if($process.ExitCode -ne 0){throw 'NETWORK_ERROR'}
        $answer=$output.Result|ConvertFrom-Json
        if(-not $answer.ok){throw ([string]$answer.code)}
        return $answer.result
    } finally {$process.Dispose()}
}
function Invoke-AiConfigLock([string]$root,[scriptblock]$body) {
    $sha=[Security.Cryptography.SHA256]::Create()
    try{$hash=[BitConverter]::ToString($sha.ComputeHash([Text.Encoding]::UTF8.GetBytes(([IO.Path]::GetFullPath($root)).ToLowerInvariant()))).Replace('-','')}finally{$sha.Dispose()}
    $handle=New-Object Threading.Mutex($false,('Local\JingcaiAi_'+$hash));$held=$false
    try{try{$held=$handle.WaitOne(30000)}catch [Threading.AbandonedMutexException]{$held=$true};if(-not $held){throw 'CONFIG_BUSY'}; & $body}finally{if($held){$handle.ReleaseMutex()};$handle.Dispose()}
}
function Read-AiSettings([string]$root) {
    $path=Join-Path $root 'ai-settings.json'
    if(-not [IO.File]::Exists($path)){return [pscustomobject]@{schemaVersion=1;profiles=(Invoke-AiNode @{op='normalize'})}}
    try{if((Get-Item -LiteralPath $path).Length -gt 65536){throw 'size'};$value=[IO.File]::ReadAllText($path)|ConvertFrom-Json;if($value.schemaVersion -ne 1 -or -not $value.profiles.openai -or -not $value.profiles.deepseek){throw 'schema'};return $value}catch{throw 'CONFIG_INVALID'}
}
function Get-AiPublicSettings([string]$root) {
    Invoke-AiConfigLock $root {
        $s=Read-AiSettings $root;$profiles=@{}
        foreach($id in @('openai','deepseek')){$p=Invoke-AiNode @{op='normalize';profile=$s.profiles.$id};$p.hasKey=[bool]$s.profiles.$id.ciphertext;$profiles[$id]=$p}
        return @{profiles=$profiles}
    }
}
function Save-AiSettings([string]$root,$message) {
    Invoke-AiConfigLock $root {
        $id=[string]$message.profileId;if($id -notin @('openai','deepseek')){throw 'CONFIG_INVALID'}
        $s=Read-AiSettings $root;$old=$s.profiles.$id
        $p=@{source='manual';provider=$id;profileId=$id;label=$old.label;baseUrl=$old.baseUrl;model=$old.model;auth='bearer';revision=[Guid]::NewGuid().ToString();hasKey=$false}
        foreach($field in @('baseUrl','model')){if($null -ne $message.$field){$p[$field]=[string]$message.$field}}
        $args=@{op='normalize';profile=$p};if($null -ne $message.key){$args.key=[string]$message.key}
        $normalized=Invoke-AiNode $args;$cipher=[string]$old.ciphertext
        if($message.clearKey -eq $true -or $normalized.baseUrl -cne $old.baseUrl){$cipher=''}
        if($null -ne $message.key){
            Add-Type -AssemblyName System.Security;$bytes=[Text.Encoding]::UTF8.GetBytes([string]$message.key)
            try{$cipher=[Convert]::ToBase64String([Security.Cryptography.ProtectedData]::Protect($bytes,$null,[Security.Cryptography.DataProtectionScope]::CurrentUser))}finally{[Array]::Clear($bytes,0,$bytes.Length)}
        }
        $normalized|Add-Member -NotePropertyName ciphertext -NotePropertyValue $cipher -Force
        $s.profiles.$id=$normalized;$target=Join-Path $root 'ai-settings.json';$temp=$target+'.'+[Guid]::NewGuid().ToString('N')+'.tmp'
        try{[IO.File]::WriteAllText($temp,($s|ConvertTo-Json -Depth 12),(New-Object Text.UTF8Encoding($false)));if([IO.File]::Exists($target)){[IO.File]::Replace($temp,$target,[NullString]::Value)}else{[IO.File]::Move($temp,$target)}}finally{if([IO.File]::Exists($temp)){[IO.File]::Delete($temp)}}
    }
    return Get-AiPublicSettings $root
}
function Resolve-AiProfile([string]$root,[string]$profileId,[string]$model) {
    if($profileId.StartsWith('cc:')){return Invoke-AiNode @{op='cc-resolve';dbPath=(Join-Path $env:USERPROFILE '.cc-switch\cc-switch.db');id=$profileId.Substring(3);model=$model}}
    if($profileId -notin @('openai','deepseek')){throw 'CONFIG_INVALID'}
    Invoke-AiConfigLock $root {
        $s=Read-AiSettings $root;$saved=$s.profiles.$profileId;$p=Invoke-AiNode @{op='normalize';profile=$saved};$secret=''
        if($model -and $model -cne $p.model){throw 'CONFIG_CHANGED'}
        if($saved.ciphertext){try{Add-Type -AssemblyName System.Security;$bytes=[Security.Cryptography.ProtectedData]::Unprotect([Convert]::FromBase64String($saved.ciphertext),$null,[Security.Cryptography.DataProtectionScope]::CurrentUser);try{$secret=[Text.Encoding]::UTF8.GetString($bytes)}finally{[Array]::Clear($bytes,0,$bytes.Length)}}catch{throw 'KEY_DECRYPT_FAILED'}}
        $p.hasKey=[bool]$secret;$p|Add-Member -NotePropertyName secret -NotePropertyValue $secret;return $p
    }
}
