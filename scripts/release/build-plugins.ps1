param([string]$OutputDirectory = 'artifacts/plugins', [string]$BaseUrl = '', [string[]]$Ids = @(), [switch]$MarketOnly)
$ErrorActionPreference = 'Stop'
$workspace = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$output = [IO.Path]::GetFullPath((Join-Path $workspace $OutputDirectory))
if (-not $output.StartsWith($workspace + [IO.Path]::DirectorySeparatorChar)) { throw 'Output must stay inside this worktree' }
New-Item -ItemType Directory -Force -Path $output | Out-Null
$appVersion = (Get-Content -Raw -Encoding UTF8 (Join-Path $workspace 'package.json') | ConvertFrom-Json).version
if ($MarketOnly) {
    if ($Ids.Count -gt 0) { throw 'Specify either plugin IDs or the market selection.' }
    $Ids = [string[]](Get-Content -Raw -Encoding UTF8 (Join-Path $workspace 'plugins/market-packages.json') | ConvertFrom-Json)
    if ($Ids.Count -eq 0) { throw 'The market package list is empty.' }
}
Add-Type -AssemblyName System.IO.Compression.FileSystem
$entries = @()
Get-ChildItem -LiteralPath (Join-Path $workspace 'plugins') -Directory | ForEach-Object {
    $manifestPath = Join-Path $_.FullName 'fly-island-plugin.json'
    if (-not (Test-Path -LiteralPath $manifestPath)) { return }
    $manifest = Get-Content -Raw -Encoding UTF8 $manifestPath | ConvertFrom-Json
    if ($manifest.id -notmatch '^[a-z][a-z0-9.-]{0,99}$' -or $manifest.id.Contains('..')) { throw 'Invalid plugin ID' }
    if ($Ids.Count -gt 0 -and $manifest.id -notin $Ids) { return }
    $target = if ($env:CARGO_TARGET_DIR) {
        $env:CARGO_TARGET_DIR
    } elseif (Test-Path ~/.cargo/config.toml) {
        $cfg = Get-Content ~/.cargo/config.toml -Raw
        if ($cfg -match 'target-dir\s*=\s*["'']([^"'']+)["'']') { $matches[1] } else { Join-Path $_.FullName 'target' }
    } else {
        Join-Path $_.FullName 'target'
    }
    $compiledRoot = [IO.Path]::GetFullPath((Join-Path $target 'release'))
    $command = [string]$manifest.runtime.command
    $binary = [IO.Path]::GetFullPath((Join-Path $compiledRoot $command))
    if (-not $command.EndsWith('.exe') -or -not $binary.StartsWith($compiledRoot + [IO.Path]::DirectorySeparatorChar)) { throw 'Unsafe plugin executable path' }
    $name = "$($manifest.id)-$($manifest.version)-windows-x86_64.zip"
    $zip = [IO.Path]::GetFullPath((Join-Path $output $name))
    if ([IO.Path]::GetFileName($zip) -cne $name) { throw 'Unsafe plugin package name' }
    $stage = Join-Path $output ".stage-$($manifest.id)"
    $stage = [IO.Path]::GetFullPath($stage)
    if (-not $stage.StartsWith($output + [IO.Path]::DirectorySeparatorChar)) { throw 'Unsafe plugin staging path' }
    $stagedBinary = [IO.Path]::GetFullPath((Join-Path $stage $command))
    if (-not $stagedBinary.StartsWith($stage + [IO.Path]::DirectorySeparatorChar)) { throw 'Unsafe plugin executable destination' }
    if (Test-Path -LiteralPath $stage) { Remove-Item -LiteralPath $stage -Recurse -Force }
    New-Item -ItemType Directory -Path $stage | Out-Null
    $temporaryZip = "$zip.partial"
    try {
        Copy-Item -LiteralPath $manifestPath -Destination $stage
        if ($manifest.id -eq 'device-battery') {
            & (Join-Path $_.FullName 'build.ps1') -OutputDirectory $stage
        } else {
            & cargo build --locked --release --manifest-path (Join-Path $_.FullName 'Cargo.toml') --target-dir $target
            if ($LASTEXITCODE -ne 0) { throw "Plugin build failed: $($manifest.id)" }
            New-Item -ItemType Directory -Force -Path (Split-Path -Parent $stagedBinary) | Out-Null
            Copy-Item -LiteralPath $binary -Destination $stagedBinary
            $license = Join-Path $_.FullName 'LICENSE'
            if (-not (Test-Path -LiteralPath $license -PathType Leaf)) { $license = Join-Path $workspace 'LICENSE' }
            Copy-Item -LiteralPath $license -Destination $stage
            Copy-Item -LiteralPath (Join-Path $workspace 'docs/third-party-licenses.md') -Destination (Join-Path $stage 'THIRD_PARTY_NOTICES.md')
        }
        if (-not (Test-Path -LiteralPath $stagedBinary -PathType Leaf)) { throw 'Packaged executable is missing.' }
        if (Test-Path -LiteralPath $temporaryZip) { Remove-Item -LiteralPath $temporaryZip -Force }
        $archive = [IO.Compression.ZipFile]::Open($temporaryZip, [IO.Compression.ZipArchiveMode]::Create)
        try {
            Get-ChildItem -LiteralPath $stage -File -Recurse -Force | Sort-Object FullName | ForEach-Object {
                $entry = $_.FullName.Substring($stage.Length + 1).Replace([char]92, [char]47)
                [void][IO.Compression.ZipFileExtensions]::CreateEntryFromFile($archive, $_.FullName, $entry)
            }
        } finally { $archive.Dispose() }
        Move-Item -LiteralPath $temporaryZip -Destination $zip -Force
    } finally {
        if (Test-Path -LiteralPath $temporaryZip) { Remove-Item -LiteralPath $temporaryZip -Force }
        Remove-Item -LiteralPath $stage -Recurse -Force
    }
    $url = if ($BaseUrl) { "$($BaseUrl.TrimEnd('/'))/$name" } else { ([uri]$zip).AbsoluteUri }
    $entries += [ordered]@{ id = $manifest.id; version = $manifest.version; name = $manifest.name; description = $manifest.description; apiVersion = 1; url = $url; sha256 = (Get-FileHash -LiteralPath $zip -Algorithm SHA256).Hash.ToLowerInvariant(); size = (Get-Item -LiteralPath $zip).Length; minAppVersion = $appVersion }
}
$missing = @($Ids | Where-Object { $_ -notin $entries.id })
if ($missing.Count -gt 0) { throw "Missing selected plugins: $($missing -join ', ')" }
$json = ConvertTo-Json -InputObject @($entries) -Depth 10
[IO.File]::WriteAllText((Join-Path $output 'plugins-index.json'), $json + "`n", [Text.UTF8Encoding]::new($false))
Write-Output "Built $($entries.Count) plugin packages: $output"
