$script:DeviceBatteryAppId = 'myfinder-device-battery'

function Get-DeviceBatteryFileHash([string]$LiteralPath) {
    $stream=$null;$sha=$null
    try {
        $stream=[IO.File]::OpenRead($LiteralPath)
        $sha=[Security.Cryptography.SHA256]::Create()
        return [BitConverter]::ToString($sha.ComputeHash($stream)).Replace('-','')
    } finally {
        if($sha){$sha.Dispose()}
        if($stream){$stream.Dispose()}
    }
}

function Read-DeviceBatteryRelease([string]$Root) {
    $release=Get-Content -LiteralPath (Join-Path $Root 'release.json') -Raw -Encoding UTF8 | ConvertFrom-Json
    if($release.schema -ne 1 -or $release.appId -cne $script:DeviceBatteryAppId -or
        $release.version -notmatch '^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$' -or
        $release.assemblyVersion -notmatch '^\d+\.\d+\.\d+\.\d+$' -or
        $release.configSchema -ne 1 -or $release.engineSchema -notin @(1,2)) {
        throw 'Invalid release metadata.'
    }
    return $release
}

function Resolve-DeviceBatteryPayloadPath([string]$Root,[string]$Relative) {
    if([string]::IsNullOrWhiteSpace($Relative) -or $Relative.Length -gt 240 -or
        $Relative.Contains('\') -or $Relative -match '(^/|//|(^|/)\.{1,2}(/|$)|[:*?"<>|\x00-\x1f])') {
        throw 'Unsafe package-relative path.'
    }
    foreach($segment in $Relative.Split('/')) {
        if($segment.EndsWith('.') -or $segment.EndsWith(' ') -or $segment -match '^(?i:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)') {
            throw 'Windows device names or aliased path segments are not allowed.'
        }
    }
    $base=[IO.Path]::GetFullPath($Root).TrimEnd([char]92,[char]47)
    $full=[IO.Path]::GetFullPath((Join-Path $base $Relative.Replace('/',[IO.Path]::DirectorySeparatorChar)))
    if(-not $full.StartsWith($base+[IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase)) {
        throw 'Package path escapes its directory.'
    }
    $ancestor=$full
    while($ancestor.Length -ge $base.Length) {
        if(Test-Path -LiteralPath $ancestor) {
            $item=Get-Item -LiteralPath $ancestor -Force
            if(($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) { throw 'Linked payload paths are not supported.' }
        }
        if($ancestor -ieq $base){break}
        $ancestor=Split-Path -Parent $ancestor
    }
    return $full
}

function Write-DeviceBatteryProviderCount([string]$Root) {
    # Use the staged runtime and staged engine. This path imports/constructs
    # every reader in an isolated child without enumerating or querying devices.
    $result=& (Join-Path $Root 'engine\runtime\python.exe') -I -B -u (Join-Path $Root 'engine\server.py') --package-smoke --once
    if($LASTEXITCODE -ne 0){throw 'Packaged engine self-test failed.'}
    $snapshot=$result | ConvertFrom-Json
    if($snapshot.schema -ne 2 -or $snapshot.complete -ne $true -or $snapshot.packageSmoke -ne $true -or
        "$($snapshot.providerCount)" -notmatch '^\d+$' -or [int]$snapshot.providerCount -le 0 -or
        $snapshot.importedProviderCount -ne $snapshot.providerCount -or $snapshot.error -or
        @($snapshot.errors).Count -ne 0 -or @($snapshot.devices).Count -ne 0){throw 'Packaged readers did not all import successfully.'}
    $release=Read-DeviceBatteryRelease $Root
    $release | Add-Member -MemberType NoteProperty -Name providerCount -Value $snapshot.providerCount -Force
    [IO.File]::WriteAllText((Join-Path $Root 'release.json'),($release | ConvertTo-Json -Depth 6),(New-Object Text.UTF8Encoding($false)))
}

function Get-DeviceBatteryEngineFiles([string]$EngineDirectory) {
    $pending=New-Object 'System.Collections.Generic.Stack[string]'
    $pending.Push([IO.Path]::GetFullPath($EngineDirectory))
    $count=0
    while($pending.Count -gt 0) {
        $directory=$pending.Pop()
        if(((Get-Item -LiteralPath $directory).Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0){throw 'Linked engine directories are not supported.'}
        foreach($item in (Get-ChildItem -LiteralPath $directory -Force)) {
            if(($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0){throw 'Linked engine payload entries are not supported.'}
            if($item.PSIsContainer){if($item.Name -notin @('tests','__pycache__','.git')){$pending.Push($item.FullName)}}
            elseif($item.Extension -ne '.pyc'){$count++;if($count -gt 5000){throw 'Engine payload exceeds the file limit.'};$item}
        }
    }
}

function New-DeviceBatteryPackageManifest([string]$Root) {
    $base=[IO.Path]::GetFullPath($Root).TrimEnd([char]92)
    $release=Read-DeviceBatteryRelease $base
    $files=New-Object 'System.Collections.Generic.List[object]'
    $pending=New-Object 'System.Collections.Generic.Stack[string]';$pending.Push($base)
    while($pending.Count -gt 0) {
        $directory=$pending.Pop()
        foreach($item in (Get-ChildItem -LiteralPath $directory -Force)) {
            if(($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0){throw 'Linked package entries are not supported.'}
            if($item.PSIsContainer){$pending.Push($item.FullName);continue}
            $relative=$item.FullName.Substring($base.Length+1).Replace('\','/')
            if($relative -eq 'package-manifest.json' -or $relative -eq '.myfinder-device-battery-install.json'){continue}
            $null=Resolve-DeviceBatteryPayloadPath $base $relative
            $files.Add([pscustomobject][ordered]@{path=$relative;length=$item.Length;sha256=(Get-DeviceBatteryFileHash $item.FullName).ToLowerInvariant()})
            if($files.Count -gt 5000){throw 'Package exceeds the file limit.'}
        }
    }
    $manifest=[ordered]@{schema=1;appId=$script:DeviceBatteryAppId;version=$release.version;configSchema=$release.configSchema;engineSchema=$release.engineSchema;files=@($files | Sort-Object path)}
    [IO.File]::WriteAllText((Join-Path $base 'package-manifest.json'),($manifest | ConvertTo-Json -Depth 8),(New-Object Text.UTF8Encoding($false)))
    return Read-DeviceBatteryPackageManifest $base
}

function Read-DeviceBatteryPackageManifest([string]$Root) {
    $path=Join-Path $Root 'package-manifest.json'
    if(-not (Test-Path -LiteralPath $path -PathType Leaf)){throw 'The complete release package manifest is missing.'}
    if((Get-Item -LiteralPath $path).Length -gt 2097152){throw 'Package manifest exceeds the size limit.'}
    $manifest=Get-Content -LiteralPath $path -Raw -Encoding UTF8 | ConvertFrom-Json
    $release=Read-DeviceBatteryRelease $Root
    if($manifest.schema -ne 1 -or $manifest.appId -cne $script:DeviceBatteryAppId -or
        $manifest.version -cne $release.version -or $manifest.configSchema -ne $release.configSchema -or
        $manifest.engineSchema -ne $release.engineSchema -or @($manifest.files).Count -eq 0 -or @($manifest.files).Count -gt 5000) {
        throw 'The package manifest identity, version or schema is invalid.'
    }
    $seen=@{}
    foreach($entry in @($manifest.files)) {
        $file=Resolve-DeviceBatteryPayloadPath $Root ([string]$entry.path)
        if($seen.ContainsKey([string]$entry.path) -or $entry.path -in @('package-manifest.json','.myfinder-device-battery-install.json') -or
            [string]$entry.sha256 -notmatch '^[a-fA-F0-9]{64}$' -or $entry.length -isnot [ValueType] -or $entry.length -lt 0) {throw 'Invalid or duplicate package file entry.'}
        $seen[[string]$entry.path]=$true
        if(-not (Test-Path -LiteralPath $file -PathType Leaf) -or (Get-Item -LiteralPath $file).Length -ne $entry.length -or
            (Get-DeviceBatteryFileHash $file) -ine $entry.sha256) {throw ('Package file is missing or changed: '+$entry.path)}
    }
    foreach($required in @('release.json','LICENSE','THIRD_PARTY_NOTICES.md','outputs/AtkMouseBattery.exe',
        'scripts/Manifest.Common.ps1','scripts/Install.Common.ps1','scripts/Install-Startup.ps1','scripts/Uninstall-Startup.ps1',
        'engine/server.py','engine/runtime/python.exe')) {
        if(-not $seen.ContainsKey($required)){throw ('Required package file is missing: '+$required)}
    }
    if((Get-Item -LiteralPath (Join-Path $Root 'outputs\AtkMouseBattery.exe')).VersionInfo.ProductVersion -cne $release.version) {
        throw 'The application binary version does not match the package release.'
    }
    return $manifest
}
