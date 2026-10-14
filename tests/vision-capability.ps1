$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot '../native/ai.ps1')
$probe=New-AiVisionProbe
if($probe.token -notmatch '^CG[A-F0-9]{8}$' -or $probe.png -notmatch '^data:image/png;base64,'){throw 'Invalid real image probe'}
. (Join-Path $PSScriptRoot '../native/gallery-image.ps1')
$null=Get-GalleryCapturePngInfo ([Convert]::FromBase64String($probe.png.Substring(22)))
function Resolve-AiProfile($root,$profileId,$model,[switch]$VisionTest){if(-not $VisionTest){throw 'Unchecked membership selection required'};return @{profileId=$profileId;model=$model;revision='r1'}}
function Save-AiTestResult($root,$profile,$result,[switch]$Vision){if(-not $Vision){throw 'Wrong test field'};$script:saved=$result}
function New-AiVisionProbe {return @{token='CG7A92BD';png='data:image/png;base64,fixture'}}
function Invoke-AiNode($payload){if($payload.text -match 'CG7A92BD'){throw 'Answer leaked into text prompt'};if(-not $payload.vision.png){throw 'Image missing'};return @{text=$script:reply}}
$script:reply='Please provide an image'
$r=Invoke-AiAction @{action='ai-test-vision';confirmed=$true;profileId='openai';model='vision';expectedRevision='r1'} $PSScriptRoot
if($r.code -ne 'IMAGE_NOT_RECOGNIZED' -or $script:saved.ok){throw 'HTTP success without recognizing the image must fail'}
$script:reply='CG7A92BD'
$r=Invoke-AiAction @{action='ai-test-vision';confirmed=$true;profileId='openai';model='vision';expectedRevision='r1'} $PSScriptRoot
if(-not $r.ok -or -not $script:saved.ok){throw 'Recognized challenge must pass'}
Write-Output 'PASS genuine image answer required and persisted independently'
