param([string]$OutputDirectory = 'artifacts/plugins', [string]$BaseUrl = '', [string[]]$Ids = @())
$ErrorActionPreference = 'Stop'
$workspace = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$output = [IO.Path]::GetFullPath((Join-Path $workspace $OutputDirectory))
if (-not $output.StartsWith($workspace + [IO.Path]::DirectorySeparatorChar)) { throw 'Output must stay inside this worktree' }
New-Item -ItemType Directory -Force -Path $output | Out-Null
$appVersion = (Get-Content -Raw -Encoding UTF8 (Join-Path $workspace 'package.json') | ConvertFrom-Json).version
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
    & cargo build --release --manifest-path (Join-Path $_.FullName 'Cargo.toml') --target-dir $target
    if ($LASTEXITCODE -ne 0) { throw "Plugin build failed: $($manifest.id)" }
    $stage = Join-Path $output ".stage-$($manifest.id)"
    $stage = [IO.Path]::GetFullPath($stage)
    if (-not $stage.StartsWith($output + [IO.Path]::DirectorySeparatorChar)) { throw 'Unsafe plugin staging path' }
    if (Test-Path -LiteralPath $stage) { Remove-Item -LiteralPath $stage -Recurse -Force }
    New-Item -ItemType Directory -Path $stage | Out-Null
    Copy-Item -LiteralPath $manifestPath -Destination $stage
    Copy-Item -LiteralPath (Join-Path $target "release/$($manifest.runtime.command)") -Destination (Join-Path $stage $manifest.runtime.command)
    Copy-Item -LiteralPath (Join-Path $workspace 'LICENSE') -Destination $stage
    $name = "$($manifest.id)-$($manifest.version)-windows-x86_64.zip"
    $zip = Join-Path $output $name
    Compress-Archive -Path (Join-Path $stage '*') -DestinationPath $zip -Force
    Remove-Item -LiteralPath $stage -Recurse -Force
    $url = if ($BaseUrl) { "$($BaseUrl.TrimEnd('/'))/$name" } else { ([uri]$zip).AbsoluteUri }
    $entries += [ordered]@{ id = $manifest.id; version = $manifest.version; name = $manifest.name; description = $manifest.description; apiVersion = 1; url = $url; sha256 = (Get-FileHash -LiteralPath $zip -Algorithm SHA256).Hash.ToLowerInvariant(); size = (Get-Item -LiteralPath $zip).Length; minAppVersion = $appVersion }
}
$json = ConvertTo-Json -InputObject @($entries) -Depth 10
[IO.File]::WriteAllText((Join-Path $output 'plugins-index.json'), $json + "`n", [Text.UTF8Encoding]::new($false))
Write-Output "Built $($entries.Count) plugin packages: $output"
