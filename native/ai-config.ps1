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
function Set-AiProperty($object,[string]$name,$value) {
    if($object -is [Collections.IDictionary]){$object[$name]=$value}else{$object|Add-Member -NotePropertyName $name -NotePropertyValue $value -Force}
}
function Read-AiSettings([string]$root) {
    $path=Join-Path $root 'ai-settings.json';$value=$null
    if([IO.File]::Exists($path)){try{if((Get-Item -LiteralPath $path).Length -gt 2097152){throw 'size'};$value=[IO.File]::ReadAllText($path)|ConvertFrom-Json}catch{throw 'CONFIG_INVALID'}}
    return Invoke-AiNode @{op='upgrade';settings=$value}
}
function Write-AiSettings([string]$root,$settings) {
    $target=Join-Path $root 'ai-settings.json';$temp=$target+'.'+[Guid]::NewGuid().ToString('N')+'.tmp'
    try{[IO.File]::WriteAllText($temp,($settings|ConvertTo-Json -Depth 20),(New-Object Text.UTF8Encoding($false)));if([IO.File]::Exists($target)){[IO.File]::Replace($temp,$target,[NullString]::Value)}else{[IO.File]::Move($temp,$target)}}finally{if([IO.File]::Exists($temp)){[IO.File]::Delete($temp)}}
}
function Protect-AiKey([string]$key) {
    Add-Type -AssemblyName System.Security;$bytes=[Text.Encoding]::UTF8.GetBytes($key)
    try{return [Convert]::ToBase64String([Security.Cryptography.ProtectedData]::Protect($bytes,$null,[Security.Cryptography.DataProtectionScope]::CurrentUser))}finally{[Array]::Clear($bytes,0,$bytes.Length)}
}
function Unprotect-AiKey([string]$cipher) {
    if(-not $cipher){return ''}
    try{Add-Type -AssemblyName System.Security;$bytes=[Security.Cryptography.ProtectedData]::Unprotect([Convert]::FromBase64String($cipher),$null,[Security.Cryptography.DataProtectionScope]::CurrentUser);try{return [Text.Encoding]::UTF8.GetString($bytes)}finally{[Array]::Clear($bytes,0,$bytes.Length)}}catch{throw 'KEY_DECRYPT_FAILED'}
}
function ConvertTo-AiPublicSettings($s) {
    $profiles=@{}
    foreach($entry in $s.profiles.PSObject.Properties){$p=Invoke-AiNode @{op='normalize';profile=$entry.Value};$p.hasKey=[bool]$entry.Value.ciphertext;if($entry.Value.lastTest){Set-AiProperty $p 'lastTest' $entry.Value.lastTest};$profiles[$entry.Name]=$p}
    return @{profiles=$profiles;defaultProfileId=$s.defaultProfileId;selectionRevision=$s.selectionRevision;importsCompleted=[bool]$s.imports.completed}
}
function Restore-AiLegacySelection($s,$ccCandidates=$null) {
    if($s.defaultProfileId -or $s.legacySelectionHandled -or -not $s.legacySelectionPending){return}
    $pending=$s.legacySelectionPending
    if($null -eq $ccCandidates){try{$ccCandidates=@(Invoke-AiNode @{op='import-read';source='ccswitch';home=$env:USERPROFILE})}catch{return}}
    $verified=@($ccCandidates|Where-Object {$_.sourceId -ceq ($pending.profileId+':'+$pending.model)})
    if($verified.Count -eq 1){
        $matches=@($s.profiles.PSObject.Properties.Value|Where-Object {$_.model -ceq $pending.model -and $_.origin.credentialFingerprint -ceq $verified[0].credentialFingerprint -and ([uri]$_.baseUrl).Host -ceq ([uri]$verified[0].baseUrl).Host -and -not $_.origin.locallyEdited})
        if($matches.Count -eq 1){$s.defaultProfileId=$matches[0].profileId;$s.selectionRevision=[Guid]::NewGuid().ToString();$s.legacySelectionHandled=$true;$s.legacySelectionPending=$null}
    }
}
function Get-AiPublicSettings([string]$root,$legacySelection=$null) {
    Invoke-AiConfigLock $root {
        $s=Read-AiSettings $root
        if(-not $s.legacySelectionHandled -and -not $s.defaultProfileId){
            $choice=if($s.legacySelectionPending){$s.legacySelectionPending}else{$legacySelection}
            if($choice){
                $p=$s.profiles.([string]$choice.profileId)
                if($p -and $p.ciphertext -and $p.model -ceq $choice.model){$s.defaultProfileId=$p.profileId;$s.selectionRevision=[Guid]::NewGuid().ToString();$s.legacySelectionHandled=$true;$s.legacySelectionPending=$null}
                elseif(([string]$choice.profileId).StartsWith('cc:') -and [string]$choice.model){$s.legacySelectionPending=@{profileId=[string]$choice.profileId;model=[string]$choice.model}}
                else{$s.legacySelectionHandled=$true}
            }
        }
        Restore-AiLegacySelection $s
        Write-AiSettings $root $s
        return ConvertTo-AiPublicSettings $s
    }
}
function New-AiDraftProfile($old,$message,[string]$id) {
    $p=@{source='manual';profileId=$id;provider='custom';protocol='chat-completions';label='自定义模型';baseUrl='';model='';auth='bearer';revision=[Guid]::NewGuid().ToString();hasKey=$false}
    if($old){foreach($field in @('provider','protocol','label','baseUrl','model','auth')){if($null -ne $old.$field){$p[$field]=$old.$field}}}
    foreach($field in @('provider','protocol','label','baseUrl','model','auth')){if($null -ne $message.$field){$p[$field]=[string]$message.$field}}
    $p.tags=@();if($old -and $null -ne $old.tags){$p.tags=@($old.tags)};if($null -ne $message.tags){$p.tags=$message.tags}
    return Invoke-AiNode @{op='normalize';profile=$p}
}
function Save-AiSettings([string]$root,$message) {
    return Invoke-AiConfigLock $root {
        $s=Read-AiSettings $root;$id=[string]$message.profileId;$old=$null
        if($id){$old=$s.profiles.$id;if(-not $old){throw 'CONFIG_INVALID'};if($message.expectedRevision -cne $old.revision){throw 'CONFIG_CHANGED'}}else{$id=[Guid]::NewGuid().ToString();if(@($s.profiles.PSObject.Properties).Count -ge 200){throw 'CONFIG_LIMIT'}}
        $p=New-AiDraftProfile $old $message $id;$cipher=[string]$old.ciphertext
        if($message.clearKey -eq $true -or $p.baseUrl -cne $old.baseUrl){$cipher=''}
        if($null -ne $message.key){$null=Invoke-AiNode @{op='normalize';key=[string]$message.key};$cipher=Protect-AiKey ([string]$message.key)}
        Set-AiProperty $p 'ciphertext' $cipher
        $requestSame=[bool]$old
        foreach($field in @('provider','protocol','baseUrl','model','auth')){if($p.$field -cne $old.$field){$requestSame=$false}}
        if($null -ne $message.key -or $message.clearKey -eq $true){$requestSame=$false}
        if($requestSame -and $old.lastTest -and $old.lastTest.revision -ceq $old.revision){$old.lastTest.revision=$p.revision;Set-AiProperty $p 'lastTest' $old.lastTest}
        if($old.origin){if(-not $requestSame -or $p.label -cne $old.label){Set-AiProperty $old.origin 'locallyEdited' $true};Set-AiProperty $p 'origin' $old.origin}
        Set-AiProperty $s.profiles $id $p;Write-AiSettings $root $s
        $r=ConvertTo-AiPublicSettings $s;$r.profileId=$id;return $r
    }
}
function Remove-AiModel([string]$root,$message) {
    return Invoke-AiConfigLock $root {
        $s=Read-AiSettings $root;$id=[string]$message.profileId;$old=$s.profiles.$id
        if(-not $old -or $message.expectedRevision -cne $old.revision){throw 'CONFIG_CHANGED'}
        if($old.origin){$s.imports.ignored=@($s.imports.ignored)+($old.origin.source+':'+$old.origin.sourceId)}
        $s.profiles.PSObject.Properties.Remove($id)
        if($s.defaultProfileId -eq $id){$s.defaultProfileId=$null;$s.selectionRevision=[Guid]::NewGuid().ToString()}
        Write-AiSettings $root $s;return ConvertTo-AiPublicSettings $s
    }
}
function Set-AiDefault([string]$root,$message) {
    return Invoke-AiConfigLock $root {
        $s=Read-AiSettings $root;$id=[string]$message.profileId;$p=$s.profiles.$id
        if($message.expectedSelectionRevision -cne $s.selectionRevision){throw 'CONFIG_CHANGED'}
        if(-not $p -or -not $p.ciphertext){throw 'KEY_NOT_CONFIGURED'}
        $s.defaultProfileId=$id;$s.selectionRevision=[Guid]::NewGuid().ToString();$s.legacySelectionHandled=$true;$s.legacySelectionPending=$null
        Write-AiSettings $root $s;return ConvertTo-AiPublicSettings $s
    }
}
function Resolve-AiDraft([string]$root,$message) {
    return Invoke-AiConfigLock $root {
        $s=Read-AiSettings $root;$old=$null;$id=[string]$message.profileId
        if($id){$old=$s.profiles.$id;if(-not $old -or $message.expectedRevision -cne $old.revision){throw 'CONFIG_CHANGED'}}else{$id=[Guid]::NewGuid().ToString()}
        $p=New-AiDraftProfile $old $message $id;$secret=''
        if($message.key){$null=Invoke-AiNode @{op='normalize';key=[string]$message.key};$secret=[string]$message.key}
        elseif($old -and $old.baseUrl -ceq $p.baseUrl){$secret=Unprotect-AiKey $old.ciphertext}
        if(-not $secret){throw 'KEY_NOT_CONFIGURED'}
        Set-AiProperty $p 'secret' $secret;$p.hasKey=$true;return $p
    }
}
function Resolve-AiProfile([string]$root,[string]$profileId,[string]$model) {
    if($profileId.StartsWith('cc:')){return Invoke-AiNode @{op='cc-resolve';dbPath=(Join-Path $env:USERPROFILE '.cc-switch\cc-switch.db');id=$profileId.Substring(3);model=$model}}
    return Invoke-AiConfigLock $root {
        $s=Read-AiSettings $root;$saved=$s.profiles.$profileId;if(-not $saved){throw 'CONFIG_CHANGED'}
        $p=Invoke-AiNode @{op='normalize';profile=$saved};if($model -and $model -cne $p.model){throw 'CONFIG_CHANGED'}
        $secret=Unprotect-AiKey $saved.ciphertext;$p.hasKey=[bool]$secret;Set-AiProperty $p 'secret' $secret;return $p
    }
}
function Save-AiTestResult([string]$root,$profile,$result) {
    Invoke-AiConfigLock $root {
        $s=Read-AiSettings $root;$p=$s.profiles.([string]$profile.profileId)
        if($p -and $p.revision -ceq $profile.revision){Set-AiProperty $p 'lastTest' $result;Write-AiSettings $root $s}
    }
}
