$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot '../native/ai.ps1')
function Resolve-AiProfile([string]$root,[string]$profileId,[string]$model,[switch]$Vision){if(-not $Vision){throw 'Vision capability required'};if($model -ne 'other-vision-model'){throw 'Wrong selected model'};return @{profileId=$profileId;model=$model;revision='fixture-revision';secret='fixture-only'}}
function Invoke-AiNode($payload){if($payload.profile.model -ne 'other-vision-model' -or -not $payload.vision.png){throw 'Wrong vision payload'};return @{text='temporary model extracted text'}}
Add-Type -AssemblyName System.Drawing
$bitmap=[Drawing.Bitmap]::new(8,8);$stream=[IO.MemoryStream]::new();try{$bitmap.Save($stream,[Drawing.Imaging.ImageFormat]::Png);$png='data:image/png;base64,'+[Convert]::ToBase64String($stream.ToArray())}finally{$stream.Dispose();$bitmap.Dispose()}
$r=Invoke-AiAction @{action='ai-capture-ocr';png=$png;language='auto';profileId='fixture';model='other-vision-model';expectedRevision='fixture-revision';confirmed=$true} $PSScriptRoot
if(-not $r.ok -or $r.text -ne 'temporary model extracted text'){throw ('Vision native failed: '+($r|ConvertTo-Json))}
Write-Output 'PASS native vision OCR selects non-default tested model temporarily without changing default'
