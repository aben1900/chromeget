. (Join-Path $PSScriptRoot 'ai-config.ps1')
. (Join-Path $PSScriptRoot 'library.ps1')
. (Join-Path $PSScriptRoot 'ai-model-import.ps1')
function Get-AiPublicProfile($profile) {
    $result=@{}
    foreach($name in @('source','provider','profileId','label','baseUrl','model','auth','hasKey','revision','models','protocol')){if($null -ne $profile.$name){$result[$name]=$profile.$name}}
    return $result
}
function Invoke-AiAction($message,[string]$directory) {
    try {
        switch ([string]$message.action) {
            'ai-models-discover' {Set-AiProperty $message.draft 'model' 'discovery';$profile=Resolve-AiDraft $PSScriptRoot $message.draft;return @{ok=$true;models=@(Invoke-AiNode @{op='models-discover';profile=$profile})}}
            'ai-settings-get' {$r=Get-AiPublicSettings $PSScriptRoot $message.legacySelection;$r.ok=$true;return $r}
            'ai-model-select' {$r=Select-AiModel $PSScriptRoot $message;$r.ok=$true;return $r}
            'ai-settings-save' {$r=Save-AiSettings $PSScriptRoot $message;$r.ok=$true;return $r}
            'ai-ccswitch-list' {return @{ok=$true;profiles=@(Invoke-AiNode @{op='cc-list';dbPath=(Join-Path $env:USERPROFILE '.cc-switch\cc-switch.db')})}}
            'ai-model-import-preview' {return New-AiImportPreview $PSScriptRoot ([string]$message.source)}
            'ai-model-import-apply' {$r=Apply-AiImport $PSScriptRoot $message;$r.ok=$true;return $r}
            'ai-model-delete' {$r=Remove-AiModel $PSScriptRoot $message;$r.ok=$true;return $r}
            'ai-default-set' {$r=Set-AiDefault $PSScriptRoot $message;$r.ok=$true;return $r}
            {$_ -in @('ai-test','ai-test-draft')} {
                if($message.confirmed -ne $true){throw 'CONFIRM_REQUIRED'}
                $draft=$message.action -eq 'ai-test-draft'
                if($draft){$profile=Resolve-AiDraft $PSScriptRoot $message.draft}else{$profile=Resolve-AiProfile $PSScriptRoot ([string]$message.profileId) ([string]$message.model);if($message.expectedRevision -and $profile.revision -cne $message.expectedRevision){throw 'CONFIG_CHANGED'}}
                $watch=[Diagnostics.Stopwatch]::StartNew();$result=@{ok=$false;revision=$profile.revision;at=[DateTime]::UtcNow.ToString('o')}
                try{$null=Invoke-AiNode @{op='request';profile=$profile;text='请仅回复 OK';length='short';isTest=$true};$result.ok=$true;$result.code='OK'}catch{$result.code=[string]$_.Exception.Message;if($result.code -notmatch '^[A-Z_]{1,60}$'){$result.code='NETWORK_ERROR'}}
                $result.elapsedMs=$watch.ElapsedMilliseconds
                if(-not $draft){Save-AiTestResult $PSScriptRoot $profile $result}else{$result.testReceipt=Save-AiDraftTest $PSScriptRoot $profile $result}
                return $result
            }
            'ai-prepare' {
                $settings=Get-AiPublicSettings $PSScriptRoot
                if(-not $settings.defaultProfileId){throw 'DEFAULT_MODEL_REQUIRED'}
                if($message.profileId -and $message.profileId -cne $settings.defaultProfileId){throw 'CONFIG_CHANGED'}
                $profile=Resolve-AiProfile $PSScriptRoot ([string]$settings.defaultProfileId) ([string]$message.model)
                return Invoke-LibraryAction @{action='library-ai-prepare';id=$message.id;profile=(Get-AiPublicProfile $profile);length=$message.length;selectionRevision=$settings.selectionRevision} $directory
            }
            'ai-generate' {
                if($message.confirmed -ne $true){throw 'CONFIRM_REQUIRED'}
                $state=Invoke-LibraryAction @{action='library-ai-inspect';requestId=$message.requestId} $directory
                if(-not $state.ok -or $state.state -ne 'prepared'){return $state}
                $snapshot=Invoke-AiConfigLock $PSScriptRoot {
                    $settings=Get-AiPublicSettings $PSScriptRoot
                    if(-not $state.selectionRevision -or $state.selectionRevision -cne $settings.selectionRevision -or $state.profileId -cne $settings.defaultProfileId){throw 'CONFIG_CHANGED'}
                    $profile=Resolve-AiProfile $PSScriptRoot ([string]$state.profileId) ([string]$state.model)
                    $claim=Invoke-LibraryAction @{action='library-ai-claim';requestId=$message.requestId;profileRevision=$profile.revision;selectionRevision=$settings.selectionRevision} $directory
                    return @{profile=$profile;claim=$claim}
                }
                $profile=$snapshot.profile;$claim=$snapshot.claim
                if(-not $claim.ok -or -not $claim.shouldSend){return $claim}
                $finish=@{action='library-ai-finish';requestId=$message.requestId;executionToken=$claim.executionToken}
                try {$r=Invoke-AiNode @{op='request';profile=$profile;text=$claim.text;length=$claim.length};$finish.text=$r.text}
                catch {$finish.action='library-ai-fail';$finish.errorCode=[string]$_.Exception.Message}
                return Invoke-LibraryAction $finish $directory
            }
            'ai-status' {return Invoke-LibraryAction @{action='library-ai-status';requestId=$message.requestId} $directory}
            'ai-recent' {return Invoke-LibraryAction @{action='library-ai-recent';id=$message.id} $directory}
            'ai-read' {return Invoke-LibraryAction @{action='library-ai-read';id=$message.id} $directory}
            'ai-save' {return Invoke-LibraryAction @{action='library-ai-save';requestId=$message.requestId;text=$message.text;expectedSummaryRevision=$message.expectedSummaryRevision} $directory}
            default {throw 'REQUEST_INVALID'}
        }
    } catch {
        $code=[string]$_.Exception.Message
        if($code -notmatch '^[A-Z_]{1,60}$'){$code='CONFIG_INVALID'}
        return @{ok=$false;code=$code;error=$code}
    }
}
