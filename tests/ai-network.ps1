param([switch]$ProbeOpenAI)
$ErrorActionPreference='Stop'
. (Join-Path (Split-Path $PSScriptRoot -Parent) 'native\ai-config.ps1')
function New-Info {$i=New-Object Diagnostics.ProcessStartInfo;foreach($k in @('HTTP_PROXY','HTTPS_PROXY','ALL_PROXY','NO_PROXY','NODE_USE_ENV_PROXY')){$i.EnvironmentVariables.Remove($k)};return $i}
$payload=@{op='models-discover';profile=@{baseUrl='https://api.openai.com/v1'}}
$proxy=New-Object Net.WebProxy('http://127.0.0.1:7890')
$i=New-Info;Set-AiNetworkEnvironment $i $payload $proxy
if($i.EnvironmentVariables['HTTPS_PROXY'] -ne 'http://127.0.0.1:7890/' -or $i.EnvironmentVariables['NODE_USE_ENV_PROXY'] -ne '1'){throw 'System proxy not enabled'}
$i=New-Info;$i.EnvironmentVariables['HTTPS_PROXY']='http://127.0.0.1:8080';Set-AiNetworkEnvironment $i $payload $proxy
if($i.EnvironmentVariables['HTTPS_PROXY'] -ne 'http://127.0.0.1:8080'){throw 'Explicit proxy overwritten'}
$i=New-Info;$payload.profile.baseUrl='http://localhost:11434/v1';Set-AiNetworkEnvironment $i $payload $proxy
if($i.EnvironmentVariables['HTTP_PROXY'] -or $i.EnvironmentVariables['NO_PROXY'] -notmatch 'localhost'){throw 'Loopback was proxied'}
Write-Output 'PASS Windows proxy fallback, environment precedence, loopback bypass.'
if($ProbeOpenAI){
    try { $null=Invoke-AiNode @{op='models-discover';profile=@{provider='openai';auth='bearer';protocol='responses';baseUrl='https://api.openai.com/v1';secret='sk-diagnostic-invalid';model='gpt-4.1-mini'}};throw 'Invalid diagnostic key unexpectedly accepted' }
    catch {if($_.Exception.Message -ne 'AUTH_FAILED'){throw};Write-Output 'PASS OpenAI reached: invalid diagnostic key returned AUTH_FAILED (no real key used).'}
}
