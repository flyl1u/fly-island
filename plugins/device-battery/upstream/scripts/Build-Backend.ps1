param([string]$OutputDirectory)
$ErrorActionPreference='Stop'
$root=Split-Path -Parent $PSScriptRoot
. (Join-Path $PSScriptRoot 'Manifest.Common.ps1')
if(-not $OutputDirectory){$OutputDirectory=Join-Path $root 'tmp\backend-runtime'}
$OutputDirectory=[IO.Path]::GetFullPath($OutputDirectory)
$lockPath=Join-Path $root 'engine\dependencies.lock.json'
$lock=Get-Content -LiteralPath $lockPath -Raw -Encoding UTF8 | ConvertFrom-Json
$downloads=Join-Path $root 'tmp\backend-downloads'
$temporary=Join-Path $root ('tmp\backend-stage-'+[Guid]::NewGuid().ToString('N'))
$stage=Join-Path $temporary 'runtime'
New-Item -ItemType Directory -Path $downloads,$stage -Force | Out-Null
Add-Type -AssemblyName System.IO.Compression.FileSystem
try {
    foreach($entry in @($lock.python,$lock.hidapi)) {
        if($entry.sha256 -notmatch '^[a-f0-9]{64}$' -or $entry.url -notmatch '^https://'){throw 'Invalid dependency lock entry.'}
        $archive=Join-Path $downloads ($entry.sha256+'.zip')
        if(-not (Test-Path -LiteralPath $archive)){
            $partial=$archive+'.partial'
            try {Invoke-WebRequest -Uri $entry.url -OutFile $partial -UseBasicParsing;Move-Item -LiteralPath $partial -Destination $archive}
            finally {if(Test-Path -LiteralPath $partial){Remove-Item -LiteralPath $partial -Force}}
        }
        if((Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash -ine $entry.sha256){throw 'Backend download checksum mismatch.'}
        $zip=[IO.Compression.ZipFile]::OpenRead($archive)
        try {
            foreach($item in $zip.Entries) {
                if($item.FullName.EndsWith('/')){continue}
                $target=Resolve-DeviceBatteryPayloadPath $stage $item.FullName
                New-Item -ItemType Directory -Path (Split-Path -Parent $target) -Force | Out-Null
                [IO.Compression.ZipFileExtensions]::ExtractToFile($item,$target,$true)
            }
        }finally{$zip.Dispose()}
    }
    Copy-Item -LiteralPath (Join-Path $root 'engine\python314._pth.in') -Destination (Join-Path $stage 'python314._pth') -Force
    $python=Join-Path $stage 'python.exe'
    if((Get-AuthenticodeSignature -LiteralPath $python).Status -ne 'Valid'){throw 'Official portable Python signature is not valid.'}
    & $python -I -B -c "import hid,ctypes,json; print('Portable battery backend dependencies ready')"
    if($LASTEXITCODE -ne 0){throw 'Portable backend import check failed.'}
    $files=@(Get-ChildItem -LiteralPath $stage -Recurse -File | Sort-Object FullName | ForEach-Object {
        [pscustomobject]@{path=$_.FullName.Substring($stage.Length+1).Replace('\','/');length=$_.Length;sha256=(Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash.ToLowerInvariant()}
    })
    $receipt=[ordered]@{schema=1;dependencyLockSha256=(Get-FileHash -LiteralPath $lockPath -Algorithm SHA256).Hash.ToLowerInvariant();
        python=$lock.python.version;hidapi=$lock.hidapi.version;files=$files}
    [IO.File]::WriteAllText((Join-Path $stage 'runtime-manifest.json'),($receipt|ConvertTo-Json -Depth 6),(New-Object Text.UTF8Encoding($false)))
    # Never package stale or unverified additions to the private runtime.
    # Preserve them on disk and require an explicit maintainer decision.
    $expected=@{};foreach($entry in $files){$expected[$entry.path]=$true};$expected['runtime-manifest.json']=$true
    if(Test-Path -LiteralPath $OutputDirectory) {
        foreach($file in (Get-DeviceBatteryEngineFiles $OutputDirectory)) {
            $relative=$file.FullName.Substring($OutputDirectory.TrimEnd([char]92).Length+1).Replace('\','/')
            if(-not $expected.ContainsKey($relative)){throw ('Unrecognized portable runtime file was preserved; use a clean build directory: '+$relative)}
        }
    }
    $changed=@(Get-ChildItem -LiteralPath $stage -Recurse -File | Where-Object {
        $relative=$_.FullName.Substring($stage.Length+1).Replace('\','/')
        $destination=Resolve-DeviceBatteryPayloadPath $OutputDirectory $relative
        -not (Test-Path -LiteralPath $destination -PathType Leaf) -or (Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash -ine (Get-FileHash -LiteralPath $destination -Algorithm SHA256).Hash
    })
    if($changed.Count -gt 0) {
        foreach($process in @(Get-Process -Name python,pythonw -ErrorAction SilentlyContinue)) {
            if($process.Path -in @((Join-Path $OutputDirectory 'python.exe'),(Join-Path $OutputDirectory 'pythonw.exe'))){
                throw 'Exit the reader using this portable runtime before rebuilding it.'
            }
        }
        foreach($file in $changed) {
            $relative=$file.FullName.Substring($stage.Length+1).Replace('\','/')
            $destination=Resolve-DeviceBatteryPayloadPath $OutputDirectory $relative
            New-Item -ItemType Directory -Path (Split-Path -Parent $destination) -Force | Out-Null
            Copy-Item -LiteralPath $file.FullName -Destination $destination -Force
        }
    }
    foreach($entry in $files) {
        $destination=Resolve-DeviceBatteryPayloadPath $OutputDirectory $entry.path
        if((Get-FileHash -LiteralPath $destination -Algorithm SHA256).Hash -ine $entry.sha256){throw 'Portable runtime copy verification failed.'}
    }
    [pscustomobject]@{Directory=$OutputDirectory;Python=$lock.python.version;Hidapi=$lock.hidapi.version;ChangedFiles=$changed.Count;Signature='Valid'}
} finally {
    $base=[IO.Path]::GetFullPath((Join-Path $root 'tmp')).TrimEnd([char]92)
    $resolved=[IO.Path]::GetFullPath($temporary)
    if((Split-Path -Parent $resolved) -ieq $base -and (Split-Path -Leaf $resolved) -match '^backend-stage-[0-9a-f]{32}$'){
        Remove-Item -LiteralPath $resolved -Recurse -Force
    }
}
