$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot '..\native\video.ps1')
Add-Type -AssemblyName System.Net.Http
$script:routes=@{};$script:requests=@()
function New-TestResponse([string]$url){
 $script:requests+=@($url)
 $route=$script:routes[$url];if(-not $route){throw 'Unexpected request'}
 $response=[Net.Http.HttpResponseMessage]::new([Net.HttpStatusCode]$route.status)
 if($route.location){$response.Headers.Location=[Uri]::new($route.location,[UriKind]::RelativeOrAbsolute)}
 $task=[pscustomobject]@{Result=$response};$task|Add-Member ScriptMethod GetAwaiter {return $this};$task|Add-Member ScriptMethod GetResult {return $this.Result};return $task
}
$client=[pscustomobject]@{}
$client|Add-Member ScriptMethod GetAsync {param($url,$completion);return New-TestResponse $url}
$client|Add-Member ScriptMethod SendAsync {param($request,$completion);if($request.Method.Method -ne 'HEAD'){throw 'Wrong metadata method'};return New-TestResponse $request.RequestUri.AbsoluteUri}
foreach($method in @('GET','HEAD')){
 $script:requests=@();$script:routes=@{'https://a.xhscdn.com/start'=@{status=302;location='https://b.xhscdn.com/image'};'https://b.xhscdn.com/image'=@{status=200}}
 $response=Invoke-GalleryRequest $client 'https://a.xhscdn.com/start' $method 'xiaohongshu'
 try{if([int]$response.StatusCode -ne 200 -or $script:requests.Count -ne 2){throw 'Valid CDN redirect failed'}}finally{$response.Dispose()}
}
foreach($target in @('http://127.0.0.1/private','https://evil.example/image','https://a.xhscdn.com/start')){
 $script:requests=@();$script:routes=@{'https://a.xhscdn.com/start'=@{status=302;location=$target}}
 $rejected=$false;try{Invoke-GalleryRequest $client 'https://a.xhscdn.com/start' 'GET' 'xiaohongshu'|Out-Null}catch{$rejected=$true}
 if(-not $rejected -or $script:requests.Count -ne 1){throw 'Unsafe or circular CDN redirect was fetched'}
}
$script:requests=@();$script:routes=@{};for($i=0;$i -lt 7;$i++){$script:routes['https://a.xhscdn.com/'+$i]=@{status=302;location=('/'+($i+1))}}
$rejected=$false;try{Invoke-GalleryRequest $client 'https://a.xhscdn.com/0' 'GET' 'xiaohongshu'|Out-Null}catch{$rejected=$true}
if(-not $rejected -or $script:requests.Count -ne 6){throw 'CDN redirect limit not enforced'}
function Invoke-GalleryRequest($client,$url,$method,$sourceKind){
 if($method -ne 'HEAD' -or $sourceKind -ne 'xiaohongshu'){throw 'Metadata did not use safe HEAD transport'}
 $response=[Net.Http.HttpResponseMessage]::new();$response.Content=[Net.Http.ByteArrayContent]::new([byte[]]@(1,2,3))
 $response.Content.Headers.ContentType=[Net.Http.Headers.MediaTypeHeaderValue]::new('image/webp');return $response
}
$metadata=Invoke-GalleryHead 'https://a.xhscdn.com/image' 'xiaohongshu'
if($metadata.format -ne 'webp' -or $metadata.bytes -ne 3){throw 'HEAD transport metadata was lost'}
Write-Output 'PASS safe CDN GET/HEAD redirects, per-hop whitelist, loop/hop bounds and HEAD metadata integration'
$settings=[pscustomobject]@{ProxyEnable=1;ProxyServer='127.0.0.1:7890';ProxyOverride='*.internal.example;localhost;<local>'}
if((Resolve-GallerySystemProxy 'https://huggingface.co/image' $settings) -ne 'http://127.0.0.1:7890/'){throw 'Configured system proxy not honored'}
if((Resolve-GallerySystemProxy 'https://api.internal.example/image' $settings) -ne ''){throw 'Proxy bypass ignored'}
$settings.ProxyServer='http=127.0.0.1:7891;https=127.0.0.1:7892'
if((Resolve-GallerySystemProxy 'https://huggingface.co/image' $settings) -ne 'http://127.0.0.1:7892/'){throw 'Per-protocol system proxy not honored'}
$settings.ProxyEnable=0
if((Resolve-GallerySystemProxy 'https://huggingface.co/image' $settings) -ne ''){throw 'Disabled system proxy used'}
Write-Output 'PASS enabled system proxy, protocol mapping, bypass rules and disabled proxy handling'
