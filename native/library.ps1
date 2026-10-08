. (Join-Path $PSScriptRoot 'journal-lock.ps1')
function Invoke-LibraryAction($message,[string]$directory) {
    $journalLock=Enter-JournalLock $directory
    try {
    $node=Join-Path $PSScriptRoot 'bin\node.exe'
    if(-not(Test-Path -LiteralPath $node)){$node=(Get-Command node.exe -ErrorAction Stop).Source}
    $info=New-Object Diagnostics.ProcessStartInfo
    $info.FileName=$node
    $info.Arguments='"'+(Join-Path $PSScriptRoot 'library.cjs')+'"'
    $info.UseShellExecute=$false;$info.CreateNoWindow=$true
    $info.RedirectStandardInput=$true;$info.RedirectStandardOutput=$true;$info.RedirectStandardError=$true
    $encoding=New-Object Text.UTF8Encoding($false)
    $info.StandardOutputEncoding=$encoding;$info.StandardErrorEncoding=$encoding
    $process=New-Object Diagnostics.Process;$process.StartInfo=$info
    try {
        [void]$process.Start()
        $output=$process.StandardOutput.ReadToEndAsync();$errors=$process.StandardError.ReadToEndAsync()
        $payload=$encoding.GetBytes((ConvertTo-Json -InputObject @{message=$message;root=$PSScriptRoot;directory=$directory} -Depth 12 -Compress))
        $process.StandardInput.BaseStream.Write($payload,0,$payload.Length)
        $process.StandardInput.Close()
        if(-not $process.WaitForExit(60000)){$process.Kill();throw '资料库处理超时，请刷新后重试。'}
        if($process.ExitCode -ne 0){throw '资料库程序未能完成操作，请更新 / 修复。'}
        return ($output.Result|ConvertFrom-Json)
    } finally {$process.Dispose()}
    } finally {Exit-JournalLock $journalLock}
}
