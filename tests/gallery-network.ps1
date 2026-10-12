$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot '..\native\video.ps1')
$root=Join-Path (Resolve-Path (Join-Path $PSScriptRoot '..')).Path ('work\gallery-network-'+[Guid]::NewGuid().ToString('N'))
[IO.Directory]::CreateDirectory((Join-Path $root 'bin'))|Out-Null
Copy-Item -LiteralPath (Join-Path $PSScriptRoot '..\native\gallery-image.ps1') -Destination $root
New-Item -ItemType HardLink -Path (Join-Path $root 'bin\node.exe') -Target (Resolve-Path (Join-Path $PSScriptRoot '..\native\bin\node.exe')).Path|Out-Null
$fixture="let data='';process.stdin.setEncoding('utf8');process.stdin.on('data',s=>data+=s);process.stdin.on('end',()=>{const r=JSON.parse(data);require('fs').writeFileSync(r.destination,r.url,'utf8');process.stdout.write(JSON.stringify({ok:true,format:'png',bytes:2}))});"
[IO.File]::WriteAllText((Join-Path $root 'gallery-http.cjs'),$fixture,(New-Object Text.UTF8Encoding($false)))
. (Join-Path $root 'gallery-image.ps1')
$folder=Join-Path $root '【网页】中文图片 [测试]';[IO.Directory]::CreateDirectory($folder)|Out-Null
$target=Join-Path $folder '第一张.png';$url='https://example.com/中文.png'
$result=Invoke-GalleryNetwork $url 'webpage' 'GET' $target
if(-not $result.ok -or -not (Test-Path -LiteralPath $target) -or [IO.File]::ReadAllText($target) -ne $url){throw 'PowerShell/Node network boundary corrupted Unicode URL or destination'}
Write-Output 'PASS Windows PowerShell transport sends UTF-8 Unicode URLs and Chinese bracketed destination paths'
