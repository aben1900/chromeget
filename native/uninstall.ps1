$ErrorActionPreference = 'Stop'
[Microsoft.Win32.Registry]::CurrentUser.DeleteSubKey('Software\Google\Chrome\NativeMessagingHosts\cn.jingcai.clipper', $false)
Write-Host '已解除本地程序注册。Chrome 扩展请在 chrome://extensions 中移除。'
Write-Host '所有摘录和本地程序文件均保留，不会删除你的资料。'
