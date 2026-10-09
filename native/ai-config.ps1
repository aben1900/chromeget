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
 return Invoke-AiConfigLock $root {
    $path=Join-Path $root 'ai-settings.json';$value=$null;$raw=$null
    if([IO.File]::Exists($path)){try{if((Get-Item -LiteralPath $path).Length -gt 2097152){throw 'size'};$raw=[IO.File]::ReadAllText($path);$value=$raw|ConvertFrom-Json}catch{throw 'CONFIG_INVALID'}}
    $groups=@{};$secrets=New-Object 'System.Collections.Generic.Dictionary[string,string]' ([StringComparer]::Ordinal);$warnings=@()
    if($value -and $value.schemaVersion -ne 3){
      foreach($entry in $value.profiles.PSObject.Properties){if($entry.Value.origin -and $entry.Value.ciphertext){try{$key=Unprotect-AiKey $entry.Value.ciphertext;if(-not $secrets.ContainsKey($key)){$secrets.Add($key,[Guid]::NewGuid().ToString())};$groups[$entry.Name]=$secrets[$key]}catch{$warnings+= 'KEY_DECRYPT_FAILED'}}}
    }
    try{$result=Invoke-AiNode @{op='config-migrate';settings=$value;credentialGroups=$groups}}finally{$secrets.Clear();$key=$null}
    $next=$result.settings
    if($warnings.Count){Set-AiProperty $next 'migrationWarnings' $warnings}
    if($value -and $value.schemaVersion -ne 3){
      $snapshot=Join-Path $root ('ai-settings.pre-v3.'+[Guid]::NewGuid().ToString('N')+'.json')
      [IO.File]::WriteAllText($snapshot,$raw,(New-Object Text.UTF8Encoding($false)))
      Write-AiSettings $root $next
    }
    return $next
 }
}

function Write-AiSettings([string]$root,$settings) {
    $target=Join-Path $root 'ai-settings.json';$temp=$target+'.'+[Guid]::NewGuid().ToString('N')+'.tmp'
    try{$json=$settings|ConvertTo-Json -Depth 20;if([Text.Encoding]::UTF8.GetByteCount($json) -gt 2097152){throw 'CONFIG_LIMIT'};[IO.File]::WriteAllText($temp,$json,(New-Object Text.UTF8Encoding($false)));if([IO.File]::Exists($target)){[IO.File]::Replace($temp,$target,[NullString]::Value)}else{[IO.File]::Move($temp,$target)}}finally{if([IO.File]::Exists($temp)){[IO.File]::Delete($temp)}}
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
    foreach($entry in $s.profiles.PSObject.Properties){$profiles[$entry.Name]=Invoke-AiNode @{op='config-public';profile=$entry.Value}}
    return @{profiles=$profiles;defaultProfileId=$s.defaultProfileId;selectionRevision=$s.selectionRevision;importsCompleted=[bool]$s.imports.completed;migrationWarnings=@($s.migrationWarnings)}
}

function Restore-AiLegacySelection($s,$ccCandidates=$null) {
    if($s.defaultProfileId -or $s.legacySelectionHandled -or -not $s.legacySelectionPending){return}
    $pending=$s.legacySelectionPending
    if($null -eq $ccCandidates){try{$ccCandidates=@(Invoke-AiNode @{op='import-read';source='ccswitch';home=$env:USERPROFILE})}catch{return}}
    $verified=@($ccCandidates|Where-Object {$_.sourceId -ceq ($pending.profileId+':'+$pending.model)})
    if($verified.Count -eq 1){

        $matches=@()
        foreach($profile in $s.profiles.PSObject.Properties.Value){foreach($model in @($profile.models)){if($model.id -ceq $pending.model -and -not $profile.locallyEdited -and @($model.origins|Where-Object {$_.credentialFingerprint -ceq $verified[0].credentialFingerprint}).Count -gt 0 -and ([uri]$profile.baseUrl).Host -ceq ([uri]$verified[0].baseUrl).Host){$matches+=$profile}}}
        if($matches.Count -eq 1){$matches[0].model=$pending.model;$s.defaultProfileId=$matches[0].profileId;$s.selectionRevision=[Guid]::NewGuid().ToString();$s.legacySelectionHandled=$true;$s.legacySelectionPending=$null}

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
    $p=@{source='manual';profileId=$id;provider='custom';protocol='chat-completions';label='自定义配置';baseUrl='';model='';auth='bearer';revision=[Guid]::NewGuid().ToString();hasKey=$false}
    if($old){foreach($field in @('provider','protocol','label','baseUrl','model','auth','models')){if($null -ne $old.$field){$p[$field]=$old.$field}}}
    foreach($field in @('provider','protocol','label','baseUrl','model','auth')){if($null -ne $message.$field){$p[$field]=[string]$message.$field}}
    $p.tags=@();if($old -and $null -ne $old.tags){$p.tags=@($old.tags)};if($null -ne $message.tags){$p.tags=$message.tags}
    if($null -ne $message.models){$p.models=@($message.models)}
    return Invoke-AiNode @{op='normalize';profile=$p}
}

function Save-AiSettings([string]$root,$message) {
    return Invoke-AiConfigLock $root {
        $s=Read-AiSettings $root;$id=[string]$message.profileId;$old=$null
        if($id){$old=$s.profiles.$id;if(-not $old){throw 'CONFIG_INVALID'};if($message.expectedRevision -cne $old.revision){throw 'CONFIG_CHANGED'}}else{$id=[Guid]::NewGuid().ToString();if(@($s.profiles.PSObject.Properties).Count -ge 200){throw 'CONFIG_LIMIT'}}
        $draft=New-AiDraftProfile $old $message $id;$cipher=[string]$old.ciphertext
        $keyChanged=$message.clearKey -eq $true -or $draft.baseUrl -cne $old.baseUrl
        if($keyChanged){$cipher=''}
        if($null -ne $message.key){$null=Invoke-AiNode @{op='normalize';key=[string]$message.key};$cipher=Protect-AiKey ([string]$message.key);$keyChanged=$true}
        $p=Invoke-AiNode @{op='config-update';old=$old;message=$draft;ciphertext=$cipher;keyChanged=$keyChanged}
        foreach($m in @($old.models)){if($m.id -cnotin @($p.models.id)){foreach($o in @($m.origins)){$s.imports.ignored=@($s.imports.ignored)+($o.source+':'+$o.sourceId)}}}
        if($message.testReceipt){Restore-AiDraftTest $root $p ([string]$message.testReceipt)}
        if(@($message.testReceipts).Count -gt 200){throw 'CONFIG_LIMIT'}
        foreach($receiptId in @($message.testReceipts)){if($receiptId){Restore-AiDraftTest $root $p ([string]$receiptId) -AnyModel}}
        if($s.defaultProfileId -ceq $id -and $old.model -cne $p.model){$s.selectionRevision=[Guid]::NewGuid().ToString()}
        Set-AiProperty $s.profiles $id $p;Write-AiSettings $root $s
        $r=ConvertTo-AiPublicSettings $s;$r.profileId=$id;return $r
    }
}
function Select-AiModel([string]$root,$message) {
    return Invoke-AiConfigLock $root {
        $s=Read-AiSettings $root;$old=$s.profiles.([string]$message.profileId)
        if(-not $old -or $old.revision -cne $message.expectedRevision){throw 'CONFIG_CHANGED'}
        if([string]$message.model -cnotin @($old.models.id)){throw 'CONFIG_INVALID'}
        return Save-AiSettings $root @{profileId=$old.profileId;expectedRevision=$old.revision;model=[string]$message.model}
    }
}

function Remove-AiModel([string]$root,$message) {
    return Invoke-AiConfigLock $root {
        $s=Read-AiSettings $root;$id=[string]$message.profileId;$old=$s.profiles.$id
        if(-not $old -or $message.expectedRevision -cne $old.revision){throw 'CONFIG_CHANGED'}
        foreach($m in @($old.models)){foreach($o in @($m.origins)){$s.imports.ignored=@($s.imports.ignored)+($o.source+':'+$o.sourceId)}}
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
        if($message.model){
            if($p.revision -cne $message.expectedRevision){throw 'CONFIG_CHANGED'}
            $m=@($p.models | Where-Object {$_.id -ceq [string]$message.model})[0]
            if(-not $m -or -not $m.lastTest.ok -or $m.lastTest.connectionRevision -cne $p.connectionRevision){throw 'MODEL_NOT_TESTED'}
            $p.model=[string]$message.model;$p.revision=[Guid]::NewGuid().ToString()
        }
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
        $p=Invoke-AiNode @{op='config-public';profile=$saved};if($model -and $model -cne $p.model){throw 'CONFIG_CHANGED'}
        $secret=Unprotect-AiKey $saved.ciphertext;$p.hasKey=[bool]$secret;Set-AiProperty $p 'secret' $secret;return $p
    }
}
function Save-AiTestResult([string]$root,$profile,$result) {
    Invoke-AiConfigLock $root {
        $s=Read-AiSettings $root;$p=$s.profiles.([string]$profile.profileId)
        if($p -and $p.revision -ceq $profile.revision){
          $model=if($profile.model){$profile.model}else{$p.model}
          $items=@($p.models|Where-Object {$_.id -ceq $model})
          if($items.Count -eq 1){Set-AiProperty $result 'connectionRevision' $p.connectionRevision;Set-AiProperty $items[0] 'lastTest' $result;Write-AiSettings $root $s}
        }
    }
}
function Get-AiTestSignature($p,[string]$secret) {
    $sha=[Security.Cryptography.SHA256]::Create()
    try{return [Convert]::ToBase64String($sha.ComputeHash([Text.Encoding]::UTF8.GetBytes((ConvertTo-Json -InputObject @($p.provider,$p.protocol,$p.baseUrl,$p.auth,$p.model,$secret) -Compress))))}finally{$sha.Dispose()}
}
function Save-AiDraftTest([string]$root,$profile,$result) {
    $folder=Join-Path $root 'ai-test-receipts';[void][IO.Directory]::CreateDirectory($folder)
    foreach($file in [IO.Directory]::GetFiles($folder,'*.json')){if([IO.File]::GetLastWriteTimeUtc($file) -lt [DateTime]::UtcNow.AddHours(-4)){[IO.File]::Delete($file)}}
    $id=[Guid]::NewGuid().ToString();$payload=@{model=$profile.model;signature=(Get-AiTestSignature $profile $profile.secret);result=$result;expires=[DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()+14400000}
    [IO.File]::WriteAllText((Join-Path $folder ($id+'.json')),(Protect-AiKey (ConvertTo-Json -InputObject $payload -Depth 8 -Compress)))
    return $id
}
function Restore-AiDraftTest([string]$root,$p,[string]$id,[switch]$AnyModel) {
    if($id -notmatch '^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$'){return}
    $file=Join-Path (Join-Path $root 'ai-test-receipts') ($id+'.json');if(-not [IO.File]::Exists($file)){return}
    try{$receipt=(Unprotect-AiKey ([IO.File]::ReadAllText($file)))|ConvertFrom-Json;if($receipt.expires -lt [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()){return};$model=if($AnyModel -and $receipt.model){[string]$receipt.model}else{$p.model};$m=@($p.models|Where-Object {$_.id -ceq $model})[0];if(-not $m){return}
      $snapshot=@{provider=$p.provider;protocol=$p.protocol;baseUrl=$p.baseUrl;auth=$p.auth;model=$model}
      $signature=Get-AiTestSignature $snapshot (Unprotect-AiKey $p.ciphertext)
      if($signature -ceq $receipt.signature){Set-AiProperty $receipt.result 'connectionRevision' $p.connectionRevision;Set-AiProperty $m 'lastTest' $receipt.result}
    }catch{}finally{if([IO.File]::Exists($file)){[IO.File]::Delete($file)}}
}
