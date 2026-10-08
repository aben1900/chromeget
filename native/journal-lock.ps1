function Enter-JournalLock([string]$directory) {
    $encoding=New-Object Text.UTF8Encoding($false)
    $sha=[Security.Cryptography.SHA256]::Create()
    try {$hash=[BitConverter]::ToString($sha.ComputeHash($encoding.GetBytes(([IO.Path]::GetFullPath($directory)).TrimEnd('\').ToLowerInvariant()))).Replace('-','')}
    finally {$sha.Dispose()}
    $handle=New-Object Threading.Mutex($false,('Local\JingcaiClipper_'+$hash))
    try {try {$acquired=$handle.WaitOne(30000)} catch [Threading.AbandonedMutexException] {$acquired=$true};if(-not $acquired){throw '资料库忙，请稍后重试。'};return $handle}
    catch {$handle.Dispose();throw}
}
function Exit-JournalLock($handle) {if($handle){try {$handle.ReleaseMutex()} finally {$handle.Dispose()}}}
