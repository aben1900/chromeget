. (Join-Path $PSScriptRoot 'ai-config.ps1')
. (Join-Path $PSScriptRoot 'library.ps1')
. (Join-Path $PSScriptRoot 'ai-model-import.ps1')
function New-AiVisionProbe {
    Add-Type -AssemblyName System.Drawing
    $token='CG'+[Guid]::NewGuid().ToString('N').Substring(0,8).ToUpperInvariant()
    $bitmap=[Drawing.Bitmap]::new(600,150);$graphics=[Drawing.Graphics]::FromImage($bitmap);$font=[Drawing.Font]::new('Arial',38,[Drawing.FontStyle]::Bold);$stream=[IO.MemoryStream]::new()
    try{$graphics.Clear([Drawing.Color]::White);$graphics.DrawString($token,$font,[Drawing.Brushes]::Black,30,40);$bitmap.Save($stream,[Drawing.Imaging.ImageFormat]::Png);return @{token=$token;png='data:image/png;base64,'+[Convert]::ToBase64String($stream.ToArray())}}
    finally{$stream.Dispose();$font.Dispose();$graphics.Dispose();$bitmap.Dispose()}
}
function Invoke-AiCapabilityTest($profile,[switch]$Vision) {
    $watch=[Diagnostics.Stopwatch]::StartNew();$result=@{ok=$false;revision=$profile.revision;at=[DateTime]::UtcNow.ToString('o')}
    try{if($Vision){$probe=New-AiVisionProbe;$r=Invoke-AiNode @{op='request';profile=$profile;vision=@{png=$probe.png;language='en-US'};text='Transcribe the image';length='short'};if(([string]$r.text).ToUpperInvariant() -notmatch [regex]::Escape($probe.token)){throw 'IMAGE_NOT_RECOGNIZED'}}else{$null=Invoke-AiNode @{op='request';profile=$profile;text='请仅回复 OK';length='short';isTest=$true}};$result.ok=$true;$result.code='OK'}
    catch{$result.code=[string]$_.Exception.Message;if($result.code -notmatch '^[A-Z_]{1,60}$'){$result.code='NETWORK_ERROR'}}
    $result.elapsedMs=$watch.ElapsedMilliseconds;return $result
}
function Get-AiPublicProfile($profile) {
    $result=@{}
    foreach($name in @('source','provider','profileId','label','baseUrl','model','auth','hasKey','revision','models','protocol')){if($null -ne $profile.$name){$result[$name]=$profile.$name}}
    return $result
}
function Invoke-AiAction($message,[string]$directory) {
    try {
        switch ([string]$message.action) {
            'ai-capture-ocr' {
                if($message.confirmed -ne $true){throw 'CONFIRM_REQUIRED'}
                . (Join-Path $PSScriptRoot 'gallery-image.ps1')
                if($message.png -isnot [string] -or $message.png.Length -gt 11184834 -or $message.png -cnotmatch '\Adata:image/png;base64,([A-Za-z0-9+/]*={0,2})\z'){throw 'INPUT_TOO_LARGE'}
                $bytes=[Convert]::FromBase64String($Matches[1]);$null=Get-GalleryCapturePngInfo $bytes
                $profile=Resolve-AiProfile $PSScriptRoot ([string]$message.profileId) ([string]$message.model) -Vision
                if(-not $message.expectedRevision -or $profile.revision -cne $message.expectedRevision){throw 'CONFIG_CHANGED'}
                $r=Invoke-AiNode @{op='request';profile=$profile;vision=@{png=$message.png;language=$message.language};text='提取截图中的文字';length='detailed'}
                return @{ok=$true;text=$r.text}
            }
            'ai-test-vision' {
                if($message.confirmed -ne $true){throw 'CONFIRM_REQUIRED'}
                $profile=Resolve-AiProfile $PSScriptRoot ([string]$message.profileId) ([string]$message.model) -VisionTest
                if(-not $message.expectedRevision -or $profile.revision -cne $message.expectedRevision){throw 'CONFIG_CHANGED'}
                $result=Invoke-AiCapabilityTest $profile -Vision;Save-AiTestResult $PSScriptRoot $profile $result -Vision;return $result
            }
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
                $vision=$draft -and $message.capability -ceq 'ocr'
                if($draft){$profile=Resolve-AiDraft $PSScriptRoot $message.draft}else{$profile=Resolve-AiProfile $PSScriptRoot ([string]$message.profileId) ([string]$message.model) -ModelTest;if($message.expectedRevision -and $profile.revision -cne $message.expectedRevision){throw 'CONFIG_CHANGED'}}
                $result=Invoke-AiCapabilityTest $profile -Vision:$vision
                if(-not $draft){Save-AiTestResult $PSScriptRoot $profile $result}else{$result.testReceipt=Save-AiDraftTest $PSScriptRoot $profile $result -Vision:$vision}
                return $result
            }
            'ai-free-translate' {return (Invoke-AiNode @{op='free-translate';message=$message})}
            'ai-translate' {
                if($message.confirmed -ne $true){throw 'CONFIRM_REQUIRED'}
                $settings=Get-AiPublicSettings $PSScriptRoot
                $id=if($message.temporary -eq $true){[string]$message.profileId}else{[string]$settings.defaultProfileId}
                if(-not $id){throw 'DEFAULT_MODEL_REQUIRED'}
                if($message.temporary -ne $true -and $message.profileId -cne $id){throw 'CONFIG_CHANGED'}
                $profile=Resolve-AiProfile $PSScriptRoot $id ([string]$message.model) -Temporary
                if($message.expectedRevision -cne $profile.revision){throw 'CONFIG_CHANGED'}
                $r=Invoke-AiNode @{op='request';profile=$profile;text=$message.text;length='standard';translation=@{sourceLanguage=$message.sourceLanguage;targetLanguage=$message.targetLanguage}}
                return @{ok=$true;text=$r.text;model=$profile.model;provider=$profile.label}
            }
            'ai-prepare' {
                $settings=Get-AiPublicSettings $PSScriptRoot
                $temporary=$message.temporary -eq $true
                if(-not $temporary -and -not $settings.defaultProfileId){throw 'DEFAULT_MODEL_REQUIRED'}
                if(-not $temporary -and $message.profileId -and $message.profileId -cne $settings.defaultProfileId){throw 'CONFIG_CHANGED'}
                $id=if($temporary){[string]$message.profileId}else{[string]$settings.defaultProfileId}
                $profile=Resolve-AiProfile $PSScriptRoot $id ([string]$message.model) -Temporary:$temporary
                return Invoke-LibraryAction @{action='library-ai-prepare';temporary=$temporary;id=$message.id;profile=(Get-AiPublicProfile $profile);length=$message.length;selectionRevision=$settings.selectionRevision} $directory
            }
            'ai-generate' {
                if($message.confirmed -ne $true){throw 'CONFIRM_REQUIRED'}
                $state=Invoke-LibraryAction @{action='library-ai-inspect';requestId=$message.requestId} $directory
                if(-not $state.ok -or $state.state -ne 'prepared'){return $state}
                $snapshot=Invoke-AiConfigLock $PSScriptRoot {
                    $settings=Get-AiPublicSettings $PSScriptRoot
                    if(-not $state.selectionRevision -or $state.selectionRevision -cne $settings.selectionRevision -or (-not $state.temporary -and $state.profileId -cne $settings.defaultProfileId)){throw 'CONFIG_CHANGED'}
                    $profile=Resolve-AiProfile $PSScriptRoot ([string]$state.profileId) ([string]$state.model) -Temporary:($state.temporary -eq $true)
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
