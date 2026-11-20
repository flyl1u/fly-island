param([string]$OutputDirectory, [switch]$SkipRuntime)
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
if (-not $OutputDirectory) { $OutputDirectory = Join-Path $root 'artifacts/device-battery' }
$OutputDirectory = [IO.Path]::GetFullPath($OutputDirectory)
$vendor = Join-Path $PSScriptRoot 'upstream'
$compiler = Join-Path $env:WINDIR 'Microsoft.NET/Framework64/v4.0.30319/csc.exe'
if (-not (Test-Path -LiteralPath $compiler)) { throw 'Windows x64 .NET Framework compiler is required.' }
New-Item -ItemType Directory -Force -Path $OutputDirectory | Out-Null
$sources = @('Bridge.cs', 'AudioSettings.cs') | ForEach-Object { Join-Path $PSScriptRoot $_ }
$sources += @('AudioControl.cs', 'HidBattery.cs', 'HeadsetBattery.cs') | ForEach-Object { Join-Path $vendor "scripts/$_" }
& $compiler /nologo /target:exe /platform:x64 /optimize+ /reference:System.Web.Extensions.dll "/out:$OutputDirectory/device-battery-bridge.exe" $sources
if ($LASTEXITCODE -ne 0) { throw 'Headless battery/audio bridge build failed.' }
if (-not $SkipRuntime) {
    & (Join-Path $vendor 'scripts/Build-Backend.ps1') -OutputDirectory (Join-Path $OutputDirectory 'engine/runtime')
}
# Copy only tracked sources, never a developer's private runtime or cache.
$engine = Join-Path $vendor 'engine'
Get-ChildItem -LiteralPath $engine -Recurse -File | Where-Object {
    $_.FullName -notmatch '[\\/](runtime|__pycache__|research|tests)[\\/]' -and $_.Extension -ne '.pyc'
} | ForEach-Object {
    $destination = Join-Path $OutputDirectory ('engine/' + $_.FullName.Substring($engine.Length + 1))
    New-Item -ItemType Directory -Force -Path (Split-Path -Parent $destination) | Out-Null
    Copy-Item -LiteralPath $_.FullName -Destination $destination -Force
}
Copy-Item -LiteralPath (Join-Path $vendor 'LICENSE'),(Join-Path $vendor 'THIRD_PARTY_NOTICES.md') -Destination $OutputDirectory -Force
[IO.File]::WriteAllText((Join-Path $OutputDirectory 'device-battery-plugin.json'), '{"id":"device-battery","version":1}', [Text.UTF8Encoding]::new($false))
Write-Output "Plugin folder: $OutputDirectory"
