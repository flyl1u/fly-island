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

New-Item -ItemType Directory -Path $work | Out-Null
try {
    $archive = Join-Path $work 'myfinder.zip'
    Invoke-WebRequest -Uri $url -UseBasicParsing -OutFile $archive -TimeoutSec 90
    if ((Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash -ine $checksum) { throw 'MyFinder source checksum mismatch.' }
    Expand-Archive -LiteralPath $archive -DestinationPath $work
    $upstream = Join-Path $work "myfinder-device-battery-$commit"
    $output = [IO.Path]::GetFullPath($OutputDirectory)
    New-Item -ItemType Directory -Force -Path $output | Out-Null
    $sources = @('Bridge.cs', 'AudioSettings.cs') | ForEach-Object { Join-Path $PSScriptRoot $_ }
    $sources += @('AudioControl.cs', 'HidBattery.cs', 'HeadsetBattery.cs') | ForEach-Object { Join-Path $upstream "scripts/$_" }
    & $compiler /nologo /target:exe /platform:x64 /optimize+ /reference:System.Web.Extensions.dll "/out:$output/device-battery-bridge.exe" $sources
    if ($LASTEXITCODE -ne 0) { throw 'The headless device bridge failed to compile.' }

    & (Join-Path $upstream 'scripts/Build-Backend.ps1') -OutputDirectory (Join-Path $output 'engine/runtime') | Out-Null
    $engine = Join-Path $upstream 'engine'
    Get-ChildItem -LiteralPath $engine -Recurse -File | Where-Object {
        $_.FullName -notmatch '[\\/](runtime|__pycache__|research|tests)[\\/]' -and $_.Extension -ne '.pyc'
    } | ForEach-Object {
        $destination = Join-Path $output ('engine/' + $_.FullName.Substring($engine.Length + 1))
        New-Item -ItemType Directory -Force -Path (Split-Path -Parent $destination) | Out-Null
        Copy-Item -LiteralPath $_.FullName -Destination $destination -Force
    }
    Copy-Item -LiteralPath (Join-Path $upstream 'LICENSE'), (Join-Path $upstream 'THIRD_PARTY_NOTICES.md') -Destination $output
    Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'README.md') -Destination (Join-Path $output 'SOURCE.md')

    $python = Join-Path $output 'engine/runtime/python.exe'
    $result = & $python -I -B -u (Join-Path $output 'engine/server.py') --package-smoke --once
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
