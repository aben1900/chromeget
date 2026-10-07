$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$utf8 = New-Object System.Text.UTF8Encoding($false)
$inputStream = [Console]::OpenStandardInput()
$outputStream = [Console]::OpenStandardOutput()
function Read-Exact([int]$count) {
    $buffer = New-Object byte[] $count
    $offset = 0
    while ($offset -lt $count) {
        $read = $inputStream.Read($buffer, $offset, $count - $offset)
        if ($read -eq 0) { throw '消息不完整。' }
        $offset += $read
    }
    return ,$buffer
}
function Write-Atomic([string]$path, [string]$value) {
    $temp = $path + '.' + [Guid]::NewGuid().ToString('N') + '.tmp'
    try {
        [IO.File]::WriteAllText($temp, $value, $utf8)
        if ([IO.File]::Exists($path)) { [IO.File]::Replace($temp, $path, [NullString]::Value) }
        else { [IO.File]::Move($temp, $path) }
    } finally { if ([IO.File]::Exists($temp)) { [IO.File]::Delete($temp) } }
}
$mutex = $null
$locked = $false
try {
    $length = [BitConverter]::ToUInt32((Read-Exact 4), 0)
    if ($length -lt 2 -or $length -gt 1048576) { throw '单条记录不能超过 1 MB。' }
    $message = $utf8.GetString((Read-Exact ([int]$length))) | ConvertFrom-Json
    $config = [IO.File]::ReadAllText((Join-Path $PSScriptRoot 'config.json'), $utf8) | ConvertFrom-Json
    $directory = [IO.Path]::GetFullPath($config.directory)
    $journal = Join-Path $directory '摘录数据.json'
    $defaultJournal = $journal
    if ($message.action -in @('list','read','delete') -and $message.journalPath) {
        if ($message.journalPath -notmatch '^[a-zA-Z]:[\\/]') { throw '请选择本地 JSON 文件。' }
        $journal = [IO.Path]::GetFullPath([string]$message.journalPath)
        if ([IO.Path]::GetExtension($journal) -ine '.json') { throw '只能加载 JSON 数据文件，不能加载 TXT。' }
        if (-not [IO.File]::Exists($journal)) { throw '所选 JSON 文件不存在，请重新选择。' }
        $directory = [IO.Path]::GetDirectoryName($journal)
    }
    if ($message.action -like 'video-*') {
        . (Join-Path $PSScriptRoot 'video.ps1')
        $response = Invoke-VideoAction $message
    } elseif ($message.action -eq 'status') {
        $response = @{ok = $true; path = $journal; journalPath=$defaultJournal; version='1.20.0'; hostPath=$PSCommandPath; storageFormat='json'; capabilities=@('list','read','delete','choose-json','video-api-2','browser-cookies','video-multisite','video-toutiao','gallery','video-youtube','video-tasks','task-reuse','task-directory','gallery-select','parallel-files','generic-files','task-progress','download-suite','audio-download','range64')}
    } elseif ($message.action -eq 'choose-json') {
        Add-Type -AssemblyName System.Windows.Forms
        $dialog = New-Object System.Windows.Forms.OpenFileDialog
        try {
            $dialog.Title = '选择精彩摘录 JSON 数据文件'
            $dialog.Filter = 'JSON 数据文件 (*.json)|*.json'
            $dialog.InitialDirectory = $directory
            $dialog.CheckFileExists = $true
            $dialog.Multiselect = $false
            if ($dialog.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) { $response = @{ok=$true; journalPath=$dialog.FileName} }
            else { $response = @{ok=$true; cancelled=$true} }
        } finally { $dialog.Dispose() }
    } elseif ($message.action -in @('save', 'list', 'read', 'delete')) {
      if ($message.action -eq 'save') {
        $r = $message.record
        if ($r.id -notmatch '^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$') { throw '记录编号无效。' }
        if ($r.type -notin @('评论', '评阅', '内容', '提示词', '网页地址')) { throw '不支持的类型。' }
        if ($r.type -eq '提示词' -and ($r.title -isnot [string] -or [string]::IsNullOrWhiteSpace($r.title) -or $r.title.Length -gt 120 -or $r.title -match '[\r\n]')) { throw '提示词需要 1–120 字的单行标题。' }
        if ($r.content -isnot [string] -or [string]::IsNullOrWhiteSpace($r.content)) { throw '不能保存空内容。' }
        $instant = [DateTimeOffset]::Parse($r.time, [Globalization.CultureInfo]::InvariantCulture)
      }
      if ($message.action -eq 'delete') {
        $ids = @($message.ids)
        if ($ids.Count -lt 1 -or $ids.Count -gt 100) { throw '每次请选择 1–100 条记录。' }
        foreach ($id in $ids) { if ($id -isnot [string] -or $id -notmatch '^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$') { throw '记录编号无效。' } }
      }
        $sha = [Security.Cryptography.SHA256]::Create()
        try { $hash = [BitConverter]::ToString($sha.ComputeHash($utf8.GetBytes($directory.ToLowerInvariant()))).Replace('-', '') }
        finally { $sha.Dispose() }
        $mutex = New-Object Threading.Mutex($false, ('Local\JingcaiClipper_' + $hash))
        try { $locked = $mutex.WaitOne(30000) } catch [Threading.AbandonedMutexException] { $locked = $true }
        if (-not $locked) { throw '文件忙，请稍后重试。' }
        [IO.Directory]::CreateDirectory($directory) | Out-Null
        $records = @()
        if ([IO.File]::Exists($journal)) {
            $raw = [IO.File]::ReadAllText($journal, $utf8)
            if (-not $raw.TrimStart().StartsWith('[')) { throw '摘录数据格式损坏，请从备份恢复。' }
            $parsed = ConvertFrom-Json -InputObject $raw
            $records = @($parsed)
        }
        $seenIds = @{}
        foreach ($entry in $records) {
            if ($null -eq $entry -or $entry.id -isnot [string] -or $entry.id -notmatch '^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$' -or $entry.content -isnot [string] -or $entry.time -isnot [string] -or $entry.type -isnot [string]) { throw 'JSON 格式不正确：需要精彩摘录导出的记录数组，每条包含 id、time、type、content。' }
            if ($seenIds.ContainsKey($entry.id)) { throw 'JSON 包含重复记录 ID，无法安全地按保存记录删除。' }
            $seenIds[$entry.id] = $true
        }
      if ($message.action -eq 'list') {
        $offset = [Math]::Max(0, [int]$message.offset)
        $ordered = @($records)
        [Array]::Reverse($ordered)
        $page = @($ordered | Select-Object -Skip $offset -First 20 | ForEach-Object {
          $preview = [string]$_.content
          if ($preview.Length -gt 240) { $preview = $preview.Substring(0, 240) + '…' }
          @{id=$_.id; time=$_.time; type=$_.type; title=$_.title; preview=$preview}
        })
        $response = @{ok=$true; records=$page; total=$records.Count; offset=$offset; journalPath=$journal}
      } elseif ($message.action -eq 'read') {
        $entry = $records | Where-Object { $_.id -eq $message.id } | Select-Object -First 1
        if (-not $entry) { throw '记录已删除，请刷新列表。' }
        $offset = [Math]::Max(0, [int]$message.offset)
        $content = [string]$entry.content
        if ($offset -gt $content.Length) { throw '内容位置无效。' }
        $count = [Math]::Min(12000, $content.Length - $offset)
        $response = @{ok=$true; content=$content.Substring($offset,$count); nextOffset=($offset+$count); total=$content.Length}
      } else {
        if ($message.action -eq 'delete') {
          $beforeCount = $records.Count
          $records = @($records | Where-Object { $_.id -notin $ids })
          Write-Atomic $journal (ConvertTo-Json -InputObject @($records) -Depth 5)
        } elseif (-not ($records | Where-Object { $_.id -eq $r.id })) {
            $entry = [PSCustomObject]@{id=$r.id; time=$instant.ToLocalTime().ToString('yyyy-MM-dd HH:mm:ss zzz'); type=$r.type; content=$r.content}
            if ($r.type -eq '提示词') { $entry | Add-Member -NotePropertyName title -NotePropertyValue $r.title.Trim() }
            $records += $entry
            Write-Atomic $journal (ConvertTo-Json -InputObject @($records) -Depth 5)
        }
        $response = @{ok = $true; path = $journal; journalPath=$journal}
        if ($message.action -eq 'delete') { $response.deleted = $beforeCount - $records.Count }
      }
    } else { throw "本地程序 1.19.0 不支持操作：$($message.action)。请重新加载扩展。" }
} catch {
    $response = @{ok = $false; error = $_.Exception.Message}
} finally {
    if ($locked) { $mutex.ReleaseMutex() }
    if ($mutex) { $mutex.Dispose() }
}
$bytes = $utf8.GetBytes((ConvertTo-Json -InputObject $response -Compress -Depth 8))
$header = [BitConverter]::GetBytes([uint32]$bytes.Length)
$outputStream.Write($header, 0, 4)
$outputStream.Write($bytes, 0, $bytes.Length)
$outputStream.Flush()
