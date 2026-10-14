function Wait-OcrOperation($operation,[Type]$resultType) {
    $method=[System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {$_.Name -eq 'AsTask' -and $_.IsGenericMethod -and $_.GetGenericArguments().Count -eq 1 -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1'} | Select-Object -First 1
    $task=$method.MakeGenericMethod($resultType).Invoke($null,@($operation))
    if(-not $task.Wait(30000)){throw '文字识别超时，请缩小截图区域重试。'}
    return $task.GetAwaiter().GetResult()
}
function Invoke-CaptureOcr($message) {
    . (Join-Path $PSScriptRoot 'gallery-image.ps1')
    if($message.png -isnot [string] -or $message.png.Length -gt 11184834 -or $message.png -cnotmatch '\Adata:image/png;base64,([A-Za-z0-9+/]*={0,2})\z'){throw '截图必须是 8 MB 以内的 PNG。'}
    $bytes=[Convert]::FromBase64String($Matches[1]);$info=Get-GalleryCapturePngInfo $bytes
    Add-Type -AssemblyName System.Runtime.WindowsRuntime
    $null=[Windows.Media.Ocr.OcrEngine,Windows.Foundation,ContentType=WindowsRuntime]
    $null=[Windows.Graphics.Imaging.BitmapDecoder,Windows.Foundation,ContentType=WindowsRuntime]
    $null=[Windows.Storage.StorageFile,Windows.Storage,ContentType=WindowsRuntime]
    $language=if($message.language){[string]$message.language}else{'zh-Hans-CN'}
    $null=[Windows.Globalization.Language,Windows.Globalization,ContentType=WindowsRuntime]
    if($language -eq 'auto'){$engine=[Windows.Media.Ocr.OcrEngine]::TryCreateFromUserProfileLanguages()}
    else {$engine=[Windows.Media.Ocr.OcrEngine]::TryCreateFromLanguage([Windows.Globalization.Language]::new($language))}
    if(-not $engine){throw 'Windows 未安装可用的 OCR 语言包，请在系统语言设置中安装所需语言的文字识别功能。'}
    if($info.width -gt [Windows.Media.Ocr.OcrEngine]::MaxImageDimension -or $info.height -gt [Windows.Media.Ocr.OcrEngine]::MaxImageDimension){throw '截图尺寸超过 Windows OCR 限制，请选择较小区域。'}
    $path=Join-Path ([IO.Path]::GetTempPath()) ('chromeget-ocr-'+[Guid]::NewGuid().ToString('N')+'.png')
    $stream=$null;$bitmap=$null
    try {
        [IO.File]::WriteAllBytes($path,$bytes)
        $file=Wait-OcrOperation ([Windows.Storage.StorageFile]::GetFileFromPathAsync($path)) ([Windows.Storage.StorageFile])
        $stream=Wait-OcrOperation ($file.OpenAsync([Windows.Storage.FileAccessMode]::Read)) ([Windows.Storage.Streams.IRandomAccessStream])
        $decoder=Wait-OcrOperation ([Windows.Graphics.Imaging.BitmapDecoder]::CreateAsync($stream)) ([Windows.Graphics.Imaging.BitmapDecoder])
        $bitmap=Wait-OcrOperation ($decoder.GetSoftwareBitmapAsync()) ([Windows.Graphics.Imaging.SoftwareBitmap])
        $result=Wait-OcrOperation ($engine.RecognizeAsync($bitmap)) ([Windows.Media.Ocr.OcrResult])
        $text=(@($result.Lines | ForEach-Object {$_.Text -replace '(?<=[\u3400-\u9fff]) +(?=[\u3400-\u9fff])',''}) -join "`n")
        if($text.Length -gt 160000){throw '识别文字超过 16 万字，请分段截图。'}
        return @{ok=$true;text=$text;language=$engine.RecognizerLanguage.LanguageTag}
    } finally {if($bitmap){$bitmap.Dispose()};if($stream){$stream.Dispose()};if([IO.File]::Exists($path)){[IO.File]::Delete($path)}}
}
function Save-RegionCapture($message) {
    . (Join-Path $PSScriptRoot 'gallery-image.ps1')
    if($message.png -isnot [string] -or $message.png.Length -gt 11184834 -or $message.png -cnotmatch '\Adata:image/png;base64,([A-Za-z0-9+/]*={0,2})\z'){throw '截图必须是 8 MB 以内的 PNG。'}
    $bytes=[Convert]::FromBase64String($Matches[1]);$null=Get-GalleryCapturePngInfo $bytes
    $name=([string]$message.name).Trim() -replace '\.png$',''
    if(-not $name -or $name.Length -gt 120 -or $name -match '[\\/:*?"<>|\x00-\x1f]' -or $name -match '[. ]$' -or $name -match '^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\.|$)'){throw '请输入有效的图片名称，不要包含路径或特殊字符。'}
    if([string]$message.directory -notmatch '^[a-zA-Z]:[\\/]'){throw '请选择本地磁盘保存目录。'}
    $directory=[IO.Path]::GetFullPath([string]$message.directory)
    if(-not [IO.Directory]::Exists($directory)){throw '保存目录不存在，请重新选择。'}
    for($i=0;$i -lt 1000;$i++) {
        $fileName=$name+$(if($i){' ('+$i+')'}else{''})+'.png';$path=Join-Path $directory $fileName
        $stream=$null
        try{$stream=[IO.File]::Open($path,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::None)}catch [IO.IOException]{if([IO.File]::Exists($path)){continue};throw}
        try{$stream.Write($bytes,0,$bytes.Length)}finally{$stream.Dispose()}
        return @{ok=$true;path=$path;filename=$fileName}
    }
    throw '同名图片过多，请修改名称后保存。'
}
function Select-CaptureDirectory($message) {
    . (Join-Path $PSScriptRoot 'video.ps1')
    Add-Type -AssemblyName System.Windows.Forms
    $dialog=[Windows.Forms.FolderBrowserDialog]::new();$dialog.Description='选择截图保存目录'
    if([IO.Directory]::Exists([string]$message.directory)){$dialog.SelectedPath=[string]$message.directory}
    try{if((Show-VideoDialog $dialog) -eq [Windows.Forms.DialogResult]::OK){return @{ok=$true;directory=$dialog.SelectedPath}};return @{ok=$true;cancelled=$true}}finally{$dialog.Dispose()}
}
