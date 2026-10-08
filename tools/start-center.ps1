param([switch]$SelfTest,[string]$SnapshotPath)
$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
[Windows.Forms.Application]::EnableVisualStyles()
$root=Split-Path $PSScriptRoot -Parent
$installRoot=Join-Path $env:LOCALAPPDATA 'JingcaiClipper'
$script:job=$null;$script:actionButtons=@()
function Quote-PS([string]$value){return "'"+$value.Replace("'","''")+"'"}
function New-Label([string]$text,[int]$height=26){$c=New-Object Windows.Forms.Label;$c.Text=$text;$c.AutoSize=$false;$c.Width=630;$c.Height=$height;$c.Margin='0,4,0,2';return $c}
function New-Button([string]$text,[int]$width=150){$c=New-Object Windows.Forms.Button;$c.Text=$text;$c.Width=$width;$c.Height=36;$c.FlatStyle='Flat';$c.FlatAppearance.BorderColor=[Drawing.ColorTranslator]::FromHtml('#CDDCD4');$c.BackColor=[Drawing.Color]::White;$c.Margin='0,0,10,0';return $c}
function New-Row{ $p=New-Object Windows.Forms.FlowLayoutPanel;$p.Width=640;$p.Height=42;$p.WrapContents=$false;$p.Margin='0,3,0,3';return $p }
function New-Page([string]$title){$page=New-Object Windows.Forms.TabPage;$page.Text=$title;$page.Padding='18,12,12,12';$page.BackColor=[Drawing.Color]::White;$flow=New-Object Windows.Forms.FlowLayoutPanel;$flow.Dock='Fill';$flow.FlowDirection='TopDown';$flow.WrapContents=$false;$flow.AutoScroll=$true;$page.Controls.Add($flow);$tabs.TabPages.Add($page);return $flow}
function Open-Path([string]$path){if(Test-Path -LiteralPath $path){[Diagnostics.Process]::Start('explorer.exe','"'+$path+'"')|Out-Null}else{[Windows.Forms.MessageBox]::Show('目录尚未创建，请先完成安装。','精彩摘录')|Out-Null}}
function Read-Installation{
    $script:installed=$false
    try{
        $manifest=Get-Content -LiteralPath (Join-Path $installRoot 'host.json') -Raw -Encoding UTF8 | ConvertFrom-Json
        $config=Get-Content -LiteralPath (Join-Path $installRoot 'config.json') -Raw -Encoding UTF8 | ConvertFrom-Json
        $script:installed=$true
        if(-not $idInput.Text){$idInput.Text=([string]$manifest.allowed_origins[0] -replace '^chrome-extension://|/$','')}
        if(-not $folderInput.Text){$folderInput.Text=$config.directory}
    }catch{}
    if(-not $folderInput.Text){$folderInput.Text=Join-Path ([Environment]::GetFolderPath('MyDocuments')) '精彩摘录'}
    if($script:installed){$installButton.Text='应用设置 / 重新安装';$stateLabel.Text='检测到本地安装 · 更新版本或连接异常时，点击“更新 / 修复”。'}else{$installButton.Text='安装并连接 Chrome';$stateLabel.Text='尚未检测到标准安装 · 按下面三步完成设置。'}
    $repairButton.Enabled=$script:installed;$engineButton.Enabled=$script:installed
}
function Start-ManagedOperation([string]$title,[string]$command){
    if($script:job){return}
    $logBox.Text='';$stateLabel.Text=$title+'，请稍候…';$progress.Style='Marquee';$progress.Visible=$true
    $script:actionButtons|ForEach-Object {$_.Enabled=$false}
    $idInput.ReadOnly=$true;$folderInput.ReadOnly=$true
    $prefix="`$ProgressPreference='SilentlyContinue'; [Console]::OutputEncoding=[Text.UTF8Encoding]::new(`$false); `$OutputEncoding=[Console]::OutputEncoding; `$ErrorActionPreference='Stop'; `$ProgressPreference='SilentlyContinue'; try { "
    $suffix="; if (`$LASTEXITCODE) { exit `$LASTEXITCODE } } catch { Write-Output `$_.Exception.Message; exit 1 }"
    $encoded=[Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($prefix+$command+$suffix))
    $info=New-Object Diagnostics.ProcessStartInfo
    $info.FileName=Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
    $info.Arguments='-NoLogo -NoProfile -NonInteractive -OutputFormat Text -ExecutionPolicy Bypass -EncodedCommand '+$encoded
    $info.UseShellExecute=$false;$info.CreateNoWindow=$true;$info.RedirectStandardOutput=$true;$info.RedirectStandardError=$true
    $info.StandardOutputEncoding=New-Object Text.UTF8Encoding($false);$info.StandardErrorEncoding=New-Object Text.UTF8Encoding($false)
    try{
        $p=New-Object Diagnostics.Process;$p.StartInfo=$info;[void]$p.Start()
        $script:job=@{process=$p;stdout=$p.StandardOutput.ReadLineAsync();stderr=$p.StandardError.ReadLineAsync();title=$title;outDone=$false;errDone=$false}
        $timer.Start()
    }catch{
        $progress.Visible=$false;$script:actionButtons|ForEach-Object {$_.Enabled=$true};$idInput.ReadOnly=$false;$folderInput.ReadOnly=$false
        Read-Installation;$stateLabel.Text='启动失败，可重试';$logBox.Text=$_.Exception.Message
    }
}
function Start-Diagnostics([bool]$full=$false){
    $command='. '+(Quote-PS (Join-Path $root 'native\diagnostics.ps1'))+'; Get-SetupDiagnostics -HostRoot '+(Quote-PS $installRoot)+' -ExpectedExtensionId '+(Quote-PS $idInput.Text.Trim())
    if($full){$command+=' -FullIntegrity'}
    $command+=' | ConvertTo-Json -Depth 6 -Compress'
    $diagnosticBox.Text='正在检查本机环境…'
    Start-ManagedOperation '本机自检' $command
}
function Update-ManagedOperation{
    if(-not $script:job){return}
    $j=$script:job
    foreach($stream in @('stdout','stderr')){
        $done=if($stream -eq 'stdout'){'outDone'}else{'errDone'}
        $reader=if($stream -eq 'stdout'){$j.process.StandardOutput}else{$j.process.StandardError}
        $lines=0
        while(-not $j[$done] -and $j[$stream].IsCompleted -and $lines -lt 80){
            $line=$j[$stream].Result
            if($null -eq $line){$j[$done]=$true;break}
            if($logBox.TextLength -gt 60000){$logBox.Text=$logBox.Text.Substring($logBox.TextLength-30000)}
            if($j.title -eq '本机自检' -and $line.StartsWith('{')){
                try{$diagnostic=ConvertFrom-Json $line;$diagnosticBox.Text=(@($diagnostic.checks|ForEach-Object{$(switch($_.state){'pass'{'✓'};'fail'{'!'};default{'○'}})+' '+$_.message}) -join [Environment]::NewLine)}catch{$diagnosticBox.Text='检查结果无法读取，请重试。'}
            }
            $logBox.AppendText($line+[Environment]::NewLine);$j[$stream]=$reader.ReadLineAsync();$lines++
        }
    }
    if($j.process.HasExited -and $j.outDone -and $j.errDone){
        $code=$j.process.ExitCode;$title=$j.title;$j.process.Dispose();$script:job=$null;$timer.Stop();$progress.Visible=$false
        $script:actionButtons|ForEach-Object {$_.Enabled=$true};$idInput.ReadOnly=$false;$folderInput.ReadOnly=$false
        Read-Installation
        $stateLabel.Text=if($code -eq 0){$title+'完成。请在 Chrome 扩展点击“重新检测”验证连接。'}else{$title+'未完成，请查看下方日志；修正后可以重试。'}
        if(-not $SelfTest -and $code -eq 0 -and $title -in @('安装','更新 / 修复')){Start-Diagnostics}
    }
}
$form=New-Object Windows.Forms.Form;$form.Text='精彩摘录 · 安装与管理';$form.Size=New-Object Drawing.Size(780,800);$form.MinimumSize=New-Object Drawing.Size(720,620);$form.Height=[Math]::Min(800,[Windows.Forms.Screen]::PrimaryScreen.WorkingArea.Height-40);$form.StartPosition='CenterScreen';$form.Font=New-Object Drawing.Font('Microsoft YaHei UI',10);$form.BackColor=[Drawing.ColorTranslator]::FromHtml('#F3F6F4');$form.AutoScaleMode='Dpi'
$layout=New-Object Windows.Forms.TableLayoutPanel;$layout.Dock='Fill';$layout.Padding='18,12,18,12';$layout.ColumnCount=1;$layout.RowCount=5
foreach($spec in @(@('Absolute',50),@('Percent',100),@('Absolute',20),@('Absolute',100),@('Absolute',48))){$layout.RowStyles.Add((New-Object Windows.Forms.RowStyle($spec[0],$spec[1])))|Out-Null}
$form.Controls.Add($layout)
$heading=New-Label '精彩摘录   安装与管理' 50;$heading.Font=New-Object Drawing.Font('Microsoft YaHei UI',18,[Drawing.FontStyle]::Bold);$heading.ForeColor=[Drawing.ColorTranslator]::FromHtml('#18705A');$layout.Controls.Add($heading,0,0)
$tabs=New-Object Windows.Forms.TabControl;$tabs.Dock='Fill';$layout.Controls.Add($tabs,0,1)
$main=New-Page '开始使用'
$main.Controls.Add((New-Label '① 在 Chrome 加载扩展' 28))
$main.Controls.Add((New-Label '打开扩展管理页 → 开启开发者模式 → 加载下面的 extension 文件夹。' 30))
$extensionPath=New-Object Windows.Forms.TextBox;$extensionPath.Width=630;$extensionPath.ReadOnly=$true;$extensionPath.Text=Join-Path $root 'extension';$main.Controls.Add($extensionPath)
$row=New-Row;$chromeButton=New-Button '打开 Chrome 扩展页' 185;$openExtension=New-Button '打开扩展文件夹' 160;$row.Controls.AddRange(@($chromeButton,$openExtension));$main.Controls.Add($row)
$chromeButton.Add_Click({
    $chrome=@((Join-Path $env:ProgramFiles 'Google\Chrome\Application\chrome.exe'),(Join-Path ${env:ProgramFiles(x86)} 'Google\Chrome\Application\chrome.exe'),(Join-Path $env:LOCALAPPDATA 'Google\Chrome\Application\chrome.exe'))|Where-Object {Test-Path -LiteralPath $_}|Select-Object -First 1
    if($chrome){[Diagnostics.Process]::Start($chrome,'chrome://extensions')|Out-Null}else{[Windows.Forms.Clipboard]::SetText('chrome://extensions');[Windows.Forms.MessageBox]::Show('已复制 chrome://extensions，请粘贴到 Chrome 地址栏。','打开扩展管理')|Out-Null}
})
$openExtension.Add_Click({Open-Path $extensionPath.Text})
$main.Controls.Add((New-Label '② 连接本地保存与下载程序' 30))
$main.Controls.Add((New-Label '扩展 ID（从 Chrome 的“精彩摘录”卡片复制）'))
$idInput=New-Object Windows.Forms.TextBox;$idInput.Width=630;$idInput.MaxLength=32;$main.Controls.Add($idInput)
$main.Controls.Add((New-Label '摘录保存目录（下载目录在扩展内单独设置）'))
$row=New-Row;$folderInput=New-Object Windows.Forms.TextBox;$folderInput.Width=485;$folderInput.Margin='0,4,10,0';$browse=New-Button '选择目录' 135;$row.Controls.AddRange(@($folderInput,$browse));$main.Controls.Add($row)
$browse.Add_Click({$dialog=New-Object Windows.Forms.FolderBrowserDialog;$dialog.Description='选择摘录 JSON 保存位置';if(Test-Path -LiteralPath $folderInput.Text){$dialog.SelectedPath=$folderInput.Text};if($dialog.ShowDialog($form) -eq 'OK'){$folderInput.Text=$dialog.SelectedPath};$dialog.Dispose()})
$row=New-Row;$installButton=New-Button '安装并连接 Chrome' 210;$installButton.BackColor=[Drawing.ColorTranslator]::FromHtml('#18705A');$installButton.ForeColor=[Drawing.Color]::White;$repairButton=New-Button '更新 / 修复' 150;$row.Controls.AddRange(@($installButton,$repairButton));$main.Controls.Add($row)
$main.Controls.Add((New-Label '首次安装会联网下载引擎。更新前请暂停下载任务；无需卸载 Chrome 扩展。' 38))
$installButton.Add_Click({
    $id=$idInput.Text.Trim();$dir=$folderInput.Text.Trim().Trim('"')
    if($id -cnotmatch '^[a-p]{32}$'){[Windows.Forms.MessageBox]::Show('请粘贴 Chrome 中显示的 32 位扩展 ID。','检查扩展 ID')|Out-Null;return}
    if($dir -notmatch '^[a-zA-Z]:[\\/]'){[Windows.Forms.MessageBox]::Show('请选择本地磁盘目录，例如 D:\我的摘录。','检查目录')|Out-Null;return}
    Start-ManagedOperation '安装' ('& '+(Quote-PS (Join-Path $root 'native\install.ps1'))+' -ExtensionId '+(Quote-PS $id)+' -Directory '+(Quote-PS $dir))
})
$repairButton.Add_Click({Start-ManagedOperation '更新 / 修复' ('& '+(Quote-PS (Join-Path $root 'native\repair.ps1')))})
$main.Controls.Add((New-Label '③ 在扩展中验证连接' 30))
$main.Controls.Add((New-Label '本机检查不代表 Chrome 已连接。打开扩展侧栏，点击“重新检测”。' 40))
$row=New-Row;$diagnose=New-Button '检查本机环境' 160;$integrity=New-Button '完整校验引擎' 160;$row.Controls.AddRange(@($diagnose,$integrity));$main.Controls.Add($row)
$diagnosticBox=New-Object Windows.Forms.TextBox;$diagnosticBox.Multiline=$true;$diagnosticBox.ReadOnly=$true;$diagnosticBox.Width=630;$diagnosticBox.Height=175;$diagnosticBox.ScrollBars='Vertical';$diagnosticBox.Text='尚未检查。安装或修复后会自动检查本机环境。';$main.Controls.Add($diagnosticBox)
$diagnose.Add_Click({Start-Diagnostics})
$integrity.Add_Click({Start-Diagnostics $true})
$help=New-Page '使用说明'
$help.Controls.Add((New-Label '安装好以后，日常使用只需点击 Chrome 工具栏里的“精彩摘录”。' 45))
$help.Controls.Add((New-Label '• 内容摘录：选中文字或网址 → 右键保存。\n• 视频 / 图集：载入网页 → 获取内容 → 选择画质或图片 → 下载。\n• 文件下载：粘贴链接 → 预览内容 → 确认下载。'.Replace('\n',[Environment]::NewLine) 110))
$help.Controls.Add((New-Label '关闭侧栏不影响后台下载。请保留已加载的 extension 文件夹。' 40))
$row=New-Row;$intro=New-Button '查看功能介绍' 160;$release=New-Button '获取最新版本' 160;$row.Controls.AddRange(@($intro,$release));$help.Controls.Add($row)
$intro.Add_Click({[Diagnostics.Process]::Start((Join-Path $root '功能介绍.html'))|Out-Null})
$release.Add_Click({[Diagnostics.Process]::Start('https://github.com/aben1900/chromeget/releases/latest')|Out-Null})
$advanced=New-Page '高级选项'
$advanced.Controls.Add((New-Label '以下功能通常不需要使用。卸载只解除本地注册，保留资料与任务。' 44))
$row=New-Row;$engineButton=New-Button '更新视频解析引擎' 190;$openInstall=New-Button '打开本地程序目录' 190;$row.Controls.AddRange(@($engineButton,$openInstall));$advanced.Controls.Add($row)
$engineButton.Add_Click({Start-ManagedOperation '更新视频解析引擎' ('& '+(Quote-PS (Join-Path $installRoot 'bin\yt-dlp.exe'))+' -U')})
$openInstall.Add_Click({Open-Path $installRoot})
$advanced.Controls.Add((New-Label '便携模式：程序保存在解压目录，仍需注册；会切换当前 Chrome 的本地连接。' 48))
$row=New-Row;$portable=New-Button '启用便携模式' 175;$unportable=New-Button '退出便携模式' 175;$row.Controls.AddRange(@($portable,$unportable));$advanced.Controls.Add($row)
$portable.Add_Click({
    if($idInput.Text.Trim() -cnotmatch '^[a-p]{32}$'){[Windows.Forms.MessageBox]::Show('请先在“开始使用”页填写扩展 ID。','缺少扩展 ID')|Out-Null;return}
    Start-ManagedOperation '启用便携模式' ('& '+(Quote-PS (Join-Path $root 'native\portable.ps1'))+' -ExtensionId '+(Quote-PS $idInput.Text.Trim()))
})
$unportable.Add_Click({Start-ManagedOperation '退出便携模式' ('& '+(Quote-PS (Join-Path $root 'native\portable.ps1'))+' -Unregister')})
$advanced.Controls.Add((New-Label '解除连接后，扩展无法保存或下载，重新安装即可恢复。' 35))
$uninstall=New-Button '解除本地连接（卸载）' 230;$uninstall.ForeColor=[Drawing.ColorTranslator]::FromHtml('#A43C30');$advanced.Controls.Add($uninstall)
$uninstall.Add_Click({if([Windows.Forms.MessageBox]::Show('确定解除本地连接？个人文件和下载任务会保留；Chrome 扩展需要自行移除。','解除连接','YesNo','Warning') -eq 'Yes'){Start-ManagedOperation '解除连接' ('& '+(Quote-PS (Join-Path $root 'native\uninstall.ps1')))}})
$progress=New-Object Windows.Forms.ProgressBar;$progress.Dock='Fill';$progress.Visible=$false;$layout.Controls.Add($progress,0,2)
$logBox=New-Object Windows.Forms.TextBox;$logBox.Multiline=$true;$logBox.ReadOnly=$true;$logBox.ScrollBars='Vertical';$logBox.Dock='Fill';$logBox.BackColor=[Drawing.Color]::White;$logBox.Font=New-Object Drawing.Font('Consolas',9);$layout.Controls.Add($logBox,0,3)
$stateLabel=New-Label '' 46;$stateLabel.Dock='Fill';$layout.Controls.Add($stateLabel,0,4)
$script:actionButtons=@($installButton,$repairButton,$browse,$engineButton,$portable,$unportable,$uninstall,$diagnose,$integrity)
$timer=New-Object Windows.Forms.Timer;$timer.Interval=150;$timer.Add_Tick({Update-ManagedOperation})
$form.Add_FormClosing({param($sender,$eventArgs);if($script:job){$eventArgs.Cancel=$true;[Windows.Forms.MessageBox]::Show('操作仍在进行，请等待完成后关闭，以免安装不完整。','请稍候')|Out-Null}})
if($SelfTest){
    $installRoot=Join-Path $root 'work\gui-empty-install';Read-Installation
    if($tabs.TabPages.Count -ne 3 -or $repairButton.Enabled){throw 'Initial UI state failed'}
    if((Quote-PS "D:\a'b") -ne "'D:\a''b'"){throw 'Argument quoting failed'}
    Start-ManagedOperation '测试' "Write-Output 'GUI smoke test'; exit 0"
    $deadline=[DateTime]::UtcNow.AddSeconds(15)
    while($script:job -and [DateTime]::UtcNow -lt $deadline){Update-ManagedOperation;Start-Sleep -Milliseconds 100}
    if($script:job -or $logBox.Text -notmatch 'GUI smoke test' -or $logBox.Text -match 'CLIXML' -or -not $installButton.Enabled){throw 'Asynchronous operation test failed'}
    Start-ManagedOperation '失败测试' "Write-Output 'Expected failure'; exit 7"
    $deadline=[DateTime]::UtcNow.AddSeconds(15)
    while($script:job -and [DateTime]::UtcNow -lt $deadline){Update-ManagedOperation;Start-Sleep -Milliseconds 100}
    if($script:job -or $stateLabel.Text -notmatch '未完成' -or -not $installButton.Enabled){throw 'Failure recovery test failed'}
    $logBox.Text='准备就绪。安装进度和日志将在这里显示。';Read-Installation
    if($SnapshotPath){$form.Show();[Windows.Forms.Application]::DoEvents();$bitmap=New-Object Drawing.Bitmap($form.Width,$form.Height);$form.DrawToBitmap($bitmap,(New-Object Drawing.Rectangle(0,0,$form.Width,$form.Height)));$bitmap.Save($SnapshotPath);$bitmap.Dispose();$form.Hide()}
    $form.Dispose();Write-Output 'PASS GUI: three tabs, argument quoting, asynchronous output, completion and controls restored; no installation or registry changes.';exit
}
Read-Installation
try{[void]$form.ShowDialog()}finally{$timer.Dispose();$form.Dispose()}
