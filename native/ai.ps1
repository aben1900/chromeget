. (Join-Path $PSScriptRoot 'ai-config.ps1')
. (Join-Path $PSScriptRoot 'library.ps1')
function Get-AiPublicProfile($profile) {
    $result=@{}
    foreach($name in @('source','provider','profileId','label','baseUrl','model','auth','hasKey','revision','models')){if($null -ne $profile.$name){$result[$name]=$profile.$name}}
    return $result
}
function Invoke-AiAction($message,[string]$directory) {
    try {
        switch ([string]$message.action) {
            'ai-settings-get' {$r=Get-AiPublicSettings $PSScriptRoot;return @{ok=$true;profiles=$r.profiles}}
            'ai-settings-save' {$r=Save-AiSettings $PSScriptRoot $message;return @{ok=$true;profiles=$r.profiles}}
            'ai-ccswitch-list' {return @{ok=$true;profiles=@(Invoke-AiNode @{op='cc-list';dbPath=(Join-Path $env:USERPROFILE '.cc-switch\cc-switch.db')})}}
            'ai-test' {
                if($message.confirmed -ne $true){throw 'CONFIRM_REQUIRED'}
                $profile=Resolve-AiProfile $PSScriptRoot ([string]$message.profileId) ([string]$message.model)
                $r=Invoke-AiNode @{op='request';profile=$profile;text='请仅回复 OK';length='short';isTest=$true}
                return @{ok=$true;text=$r.text}
            }
            'ai-prepare' {
                $profile=Resolve-AiProfile $PSScriptRoot ([string]$message.profileId) ([string]$message.model)
                return Invoke-LibraryAction @{action='library-ai-prepare';id=$message.id;profile=(Get-AiPublicProfile $profile);length=$message.length} $directory
            }
            'ai-generate' {
                if($message.confirmed -ne $true){throw 'CONFIRM_REQUIRED'}
                $state=Invoke-LibraryAction @{action='library-ai-inspect';requestId=$message.requestId} $directory
                if(-not $state.ok -or $state.state -ne 'prepared'){return $state}
                $profile=Resolve-AiProfile $PSScriptRoot ([string]$state.profileId) ([string]$state.model)
                $claim=Invoke-LibraryAction @{action='library-ai-claim';requestId=$message.requestId;profileRevision=$profile.revision} $directory
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
