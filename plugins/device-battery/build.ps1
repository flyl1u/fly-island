param([Parameter(Mandatory)][string]$OutputDirectory)
$ErrorActionPreference = 'Stop'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$commit = '73d99e2087dd70ae8eef4199854e0c495a66f0bc'
$checksum = '81ba5f15640e37029e84d1ab1afc2852fd9b57f536c7f8c5bd130d90b0e08d64'
$url = "https://codeload.github.com/wushuai0802/myfinder-device-battery/zip/$commit"
$tmp = [IO.Path]::GetFullPath([IO.Path]::GetTempPath()).TrimEnd([char]92, [char]47)
$work = [IO.Path]::GetFullPath((Join-Path $tmp ('fly-battery-' + [Guid]::NewGuid().ToString('N'))))
$compiler = Join-Path $env:WINDIR 'Microsoft.NET/Framework64/v4.0.30319/csc.exe'
if (-not (Test-Path -LiteralPath $compiler -PathType Leaf)) { throw 'The Windows x64 .NET Framework compiler is required.' }

# The license texts of every crate linked into the engine (MIT where there is a choice).
function Write-CrateNotices {
    param($Metadata, [string]$Path)
    $packages = @{}
    foreach ($package in $Metadata.packages) { $packages[$package.id] = $package }
    $nodes = @{}
    foreach ($node in $Metadata.resolve.nodes) { $nodes[$node.id] = $node }
    $root = @($Metadata.packages | Where-Object { $_.name -ceq 'device-battery-engine' })[0].id
    $linked = @{}
    $pending = New-Object System.Collections.Generic.Stack[string]
    $pending.Push($root)
    while ($pending.Count -gt 0) {
        foreach ($dependency in $nodes[$pending.Pop()].deps) {
            $id = $dependency.pkg
            $normal = @($dependency.dep_kinds | Where-Object { $null -eq $_.kind }).Count -gt 0
            $macro = @($packages[$id].targets | Where-Object { $_.kind -contains 'proc-macro' }).Count -gt 0
            if ($normal -and -not $macro -and -not $linked.ContainsKey($id)) {
                $linked[$id] = $packages[$id]
                $pending.Push($id)
            }
        }
    }
    $text = New-Object System.Text.StringBuilder
    foreach ($package in ($linked.Values | Sort-Object name, version)) {
        $directory = Split-Path -Parent $package.manifest_path
        $file = @('LICENSE-MIT', 'LICENSE.txt', 'LICENSE') | ForEach-Object { Join-Path $directory $_ } |
            Where-Object { Test-Path -LiteralPath $_ -PathType Leaf } | Select-Object -First 1
        if (-not $file) { throw "No license text for the crate $($package.name)." }
        [void]$text.Append("==== $($package.name) $($package.version) ($($package.license)) ====`n$($package.repository)`n`n")
        [void]$text.Append([IO.File]::ReadAllText($file).Replace("`r`n", "`n").TrimEnd() + "`n`n")
    }
    [IO.File]::WriteAllText($Path, $text.ToString(), [Text.UTF8Encoding]::new($false))
}

New-Item -ItemType Directory -Path $work | Out-Null
try {
    $archive = Join-Path $work 'myfinder.zip'
    Invoke-WebRequest -Uri $url -UseBasicParsing -OutFile $archive -TimeoutSec 600
    if ((Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash -ine $checksum) { throw 'MyFinder source checksum mismatch.' }
    Expand-Archive -LiteralPath $archive -DestinationPath $work
    $upstream = Join-Path $work "myfinder-device-battery-$commit"
    $output = [IO.Path]::GetFullPath($OutputDirectory)
    New-Item -ItemType Directory -Force -Path $output | Out-Null
    $sources = @('Bridge.cs', 'AudioSettings.cs') | ForEach-Object { Join-Path $PSScriptRoot $_ }
    $sources += @('AudioControl.cs', 'HidBattery.cs', 'HeadsetBattery.cs') | ForEach-Object { Join-Path $upstream "scripts/$_" }
    & $compiler /nologo /target:exe /platform:x64 /optimize+ /reference:System.Web.Extensions.dll "/out:$output/device-battery-bridge.exe" $sources
    if ($LASTEXITCODE -ne 0) { throw 'The headless device bridge failed to compile.' }

    # The reader engine is Fly Island's own Rust crate. The host starts it at the path of
    # the interpreter it replaced, with that interpreter's arguments, which it ignores.
    $crate = Join-Path $PSScriptRoot 'engine/Cargo.toml'
    $metadata = (& cargo metadata --format-version 1 --locked --filter-platform x86_64-pc-windows-msvc --manifest-path $crate | Out-String) | ConvertFrom-Json
    if ($LASTEXITCODE -ne 0) { throw 'Could not read the device engine dependencies.' }
    & cargo build --locked --release --manifest-path $crate --target-dir $metadata.target_directory
    if ($LASTEXITCODE -ne 0) { throw 'The device reader engine failed to build.' }
    $engine = Join-Path $output 'engine/runtime/python.exe'
    $server = Join-Path $output 'engine/server.py'
    New-Item -ItemType Directory -Force -Path (Split-Path -Parent $engine) | Out-Null
    Copy-Item -LiteralPath (Join-Path $metadata.target_directory 'release/device-battery-engine.exe') -Destination $engine -Force
    [IO.File]::WriteAllText($server, "# Placeholder required by the Fly Island host. runtime/python.exe is the Rust reader engine; no Python is included.`n", [Text.UTF8Encoding]::new($false))

    $licenses = Join-Path $output 'licenses'
    New-Item -ItemType Directory -Force -Path $licenses | Out-Null
    Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'licenses/HaloBattery-MIT.txt') -Destination $licenses
    Write-CrateNotices -Metadata $metadata -Path (Join-Path $licenses 'rust-crates.txt')
    Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'LICENSE'), (Join-Path $PSScriptRoot 'THIRD_PARTY_NOTICES.md') -Destination $output
    Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'README.md') -Destination (Join-Path $output 'SOURCE.md')

    $result = & $engine -I -B $server --package-smoke --once
    if ($LASTEXITCODE -ne 0) { throw 'Packaged device engine self-test failed.' }
    $snapshot = $result | ConvertFrom-Json
    if ($snapshot.schema -ne 2 -or -not $snapshot.complete -or -not $snapshot.packageSmoke -or
        $snapshot.providerCount -le 0 -or $snapshot.providerCount -ne $snapshot.importedProviderCount -or
        @($snapshot.errors).Count -gt 0) { throw 'Some packaged readers failed to initialize.' }
    Write-Output "Verified $($snapshot.providerCount) device readers."
} finally {
    if ((Split-Path -Parent $work) -ieq $tmp -and (Split-Path -Leaf $work) -cmatch '^fly-battery-[0-9a-f]{32}$') {
        Remove-Item -LiteralPath $work -Recurse -Force
    }
}
