function New-AiImportPreview([string]$root,[string]$source) {
    $candidates=@(Invoke-AiNode @{op='import-read';source=$source;home=$env:USERPROFILE})
    return Invoke-AiConfigLock $root {
        $s=Read-AiSettings $root;$items=@(Invoke-AiNode @{op='import-compare';settings=$s;candidates=$candidates})
        $id=[Guid]::NewGuid().ToString();$expires=[DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()+600000
        $payload=@{source=$source;items=$items;expiresAt=$expires}
        $folder=Join-Path $root 'ai-import-previews';[void][IO.Directory]::CreateDirectory($folder)
        foreach($file in [IO.Directory]::GetFiles($folder,'*.json')){if([IO.File]::GetLastWriteTimeUtc($file) -lt [DateTime]::UtcNow.AddMinutes(-10)){[IO.File]::Delete($file)}}
        $cipher=Protect-AiKey (ConvertTo-Json -InputObject $payload -Depth 20 -Compress)
        [IO.File]::WriteAllText((Join-Path $folder ($id+'.json')),$cipher)
        return @{ok=$true;previewId=$id;items=@(Invoke-AiNode @{op='import-public';items=$items});expiresAt=$expires}
    }
}
function Apply-AiImport([string]$root,$message) {
    $id=[string]$message.previewId;if($id -notmatch '^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$'){throw 'IMPORT_CHANGED'}
    $file=Join-Path (Join-Path $root 'ai-import-previews') ($id+'.json')
    if(-not [IO.File]::Exists($file) -or (Get-Item -LiteralPath $file).Length -gt 6000000){throw 'IMPORT_CHANGED'}
    $preview=(Unprotect-AiKey ([IO.File]::ReadAllText($file)))|ConvertFrom-Json
    if($preview.expiresAt -lt [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()){throw 'IMPORT_CHANGED'}
    $fresh=@(Invoke-AiNode @{op='import-read';source=$preview.source;home=$env:USERPROFILE})
    return Invoke-AiConfigLock $root {
        $s=Read-AiSettings $root
        foreach($candidateId in @($message.candidateIds)){
            $items=@($preview.items|Where-Object {$_.candidateId -ceq $candidateId});if($items.Count -ne 1){throw 'IMPORT_CHANGED'};$item=$items[0]
            $matches=@($fresh|Where-Object {$_.sourceId -ceq $item.sourceId});if($matches.Count -ne 1 -or $matches[0].fingerprint -cne $item.fingerprint){throw 'IMPORT_CHANGED'}
            if($item.change -eq 'same'){continue}
            if($item.conflict -and $candidateId -notin @($message.overwriteIds)){throw 'IMPORT_CONFLICT'}
            if($item.change -eq 'ignored' -and $candidateId -notin @($message.restoreIds)){throw 'IMPORT_CONFLICT'}
            $target=[string]$item.targetId
            if($target){$old=$s.profiles.$target;if(-not $old -or $old.revision -cne $item.targetRevision){throw 'IMPORT_CHANGED'}}else{
                if(@($s.profiles.PSObject.Properties).Count -ge 200){throw 'CONFIG_LIMIT'}
                $current=@(Invoke-AiNode @{op='import-compare';settings=$s;candidates=@($matches[0])})
                if($current[0].targetId -or ($current[0].change -eq 'ignored' -and $item.change -ne 'ignored')){throw 'IMPORT_CHANGED'}
                $target=[Guid]::NewGuid().ToString()
            }
            $p=Invoke-AiNode @{op='normalize';profile=$matches[0]};$p.profileId=$target;$p.revision=[Guid]::NewGuid().ToString()
            Set-AiProperty $p 'ciphertext' (Protect-AiKey $matches[0].secret)
            Set-AiProperty $p 'origin' @{source=$item.source;sourceId=$item.sourceId;fingerprint=$item.fingerprint;credentialFingerprint=$item.credentialFingerprint;locallyEdited=$false}
            Set-AiProperty $s.profiles $target $p
            $s.imports.ignored=@($s.imports.ignored|Where-Object {$_ -cne ($item.source+':'+$item.sourceId)})
        }
        $s.imports.completed=$true;Write-AiSettings $root $s;[IO.File]::Delete($file)
        return ConvertTo-AiPublicSettings $s
    }
}
