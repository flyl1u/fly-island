#requires -Version 5.1
param(
    [ValidateRange(10, 300)][int]$ObservationSeconds = 180,
    [string]$ExecutablePath
)

$ErrorActionPreference = 'Stop'
$taskRepository = Split-Path -Parent $PSScriptRoot
$taskProductionExecutable = (Resolve-Path -LiteralPath (Join-Path $taskRepository 'src-tauri\target\release\fly-island.exe')).Path
$taskExecutable = if ($ExecutablePath) { (Resolve-Path -LiteralPath $ExecutablePath).Path } else { $taskProductionExecutable }
$taskRunId = [Guid]::NewGuid().ToString('N')
$taskRunDirectory = Join-Path $taskRepository ('src-tauri\target\first-run-verification\' + $taskRunId)
$taskProfile = Join-Path $taskRunDirectory 'WebView2'
$taskIdentifier = 'com.focusd.island.verification.' + $taskRunId
$taskReportPath = Join-Path ([IO.Path]::GetTempPath()) ('FocuSD-notification-verification\' + $taskRunId + '.json')
foreach ($taskRoot in @([Environment]::GetFolderPath('ApplicationData'), [Environment]::GetFolderPath('LocalApplicationData'))) {
    if (Test-Path -LiteralPath (Join-Path $taskRoot $taskIdentifier)) { throw 'Verification application data already exists.' }
}
if (Test-Path -LiteralPath $taskProfile) { throw 'Verification WebView2 profile already exists.' }
$null = New-Item -ItemType Directory -Path $taskRunDirectory
$taskCopy = Join-Path $taskRunDirectory 'fly-island.exe'
Copy-Item -LiteralPath $taskExecutable -Destination $taskCopy
$taskSourceHash = (Get-FileHash -LiteralPath $taskExecutable -Algorithm SHA256).Hash
if ((Get-FileHash -LiteralPath $taskCopy -Algorithm SHA256).Hash -ne $taskSourceHash) { throw 'Copied executable does not match the release build.' }
$taskLoader = Join-Path (Split-Path -Parent $taskExecutable) 'WebView2Loader.dll'
if (Test-Path -LiteralPath $taskLoader) { Copy-Item -LiteralPath $taskLoader -Destination $taskRunDirectory }
$taskOriginalProcesses = @(Get-CimInstance Win32_Process -Filter "Name = 'fly-island.exe'" | Where-Object { $_.ExecutablePath -eq $taskProductionExecutable })
$taskProcess = $null
$taskLatest = $null
try {
    foreach ($taskOriginal in $taskOriginalProcesses) { Stop-Process -Id $taskOriginal.ProcessId -ErrorAction Stop }
    $taskStart = [Diagnostics.ProcessStartInfo]::new()
    $taskStart.FileName = $taskCopy
    $taskStart.WorkingDirectory = $taskRunDirectory
    $taskStart.UseShellExecute = $false
    $taskStart.CreateNoWindow = $true
    $taskStart.WindowStyle = [Diagnostics.ProcessWindowStyle]::Hidden
    $taskStart.EnvironmentVariables['WEBVIEW2_USER_DATA_FOLDER'] = $taskProfile
    $taskStart.EnvironmentVariables['FOCUSD_VERIFY_NOTIFICATIONS'] = '1'
    $taskStart.EnvironmentVariables['FOCUSD_NOTIFICATION_VERIFICATION_ID'] = $taskRunId
    $taskStart.EnvironmentVariables['FOCUSD_VERIFY_NOTIFICATION_SECONDS'] = [string]$ObservationSeconds
    $taskProcess = [Diagnostics.Process]::Start($taskStart)
    [pscustomobject]@{ Phase='Started'; Pid=$taskProcess.Id; Directory=$taskRunDirectory; NativeReport=$taskReportPath; Sha256=$taskSourceHash } | ConvertTo-Json -Compress
    $taskDeadline = [DateTime]::UtcNow.AddSeconds($ObservationSeconds + 30)
    $taskLastState = ''
    while ([DateTime]::UtcNow -lt $taskDeadline) {
        if ($taskProcess.HasExited) { throw ('Verification application exited: ' + $taskProcess.ExitCode) }
        if (Test-Path -LiteralPath $taskReportPath) {
            try { $taskLatest = Get-Content -LiteralPath $taskReportPath -Raw -Encoding UTF8 | ConvertFrom-Json } catch { Start-Sleep -Milliseconds 100; continue }
            if ($taskLatest.verificationRunId -ne $taskRunId -or $taskLatest.appIdentifier -ne $taskIdentifier) { throw 'Report identity mismatch.' }
            $taskState = [pscustomobject]@{ Phase='Observing'; QQEnabled=$taskLatest.current.qq.enabled; QQStatus=$taskLatest.current.qq.status; QQError=$taskLatest.current.qq.error; QQArrived=$taskLatest.qqArrivalObserved; WeChatEnabled=$taskLatest.current.wechat.enabled; WeChatStatus=$taskLatest.current.wechat.status; WeChatAttention=$taskLatest.wechatAttentionObserved } | ConvertTo-Json -Compress
            if ($taskState -ne $taskLastState) { Write-Output $taskState; $taskLastState = $taskState }
            if ($taskLatest.completed -or ($taskLatest.qqArrivalObserved -and $taskLatest.wechatAttentionObserved -and $taskLatest.elapsedMs -ge 10000)) { break }
        }
        Start-Sleep -Milliseconds 500
    }
    if (-not $taskLatest) { throw 'No native verification report was produced.' }
    $taskResult = [ordered]@{
        runId=$taskRunId; sourceExecutable=$taskExecutable; executableSha256=$taskSourceHash; freshWebViewProfile=(Test-Path -LiteralPath $taskProfile);
        isolatedNativeData=($taskLatest.appIdentifier -eq $taskIdentifier -and (Split-Path -Leaf $taskLatest.nativeAppDataDirectory) -eq $taskIdentifier);
        defaultQQEnabled=$taskLatest.current.qq.enabled; defaultWeChatEnabled=$taskLatest.current.wechat.enabled;
        qqListening=($taskLatest.current.qq.status -eq 'listening' -and -not $taskLatest.current.qq.error);
        wechatListening=($taskLatest.current.wechat.status -eq 'listening' -and -not $taskLatest.current.wechat.error);
        qqRealArrival=$taskLatest.qqArrivalObserved; wechatAttention=$taskLatest.wechatAttentionObserved;
        scope='Fresh application data on the existing Windows account. Does not reset Windows permissions or QQ/WeChat settings.';
        native=$taskLatest
    }
    $taskResult | ConvertTo-Json -Depth 12 | Set-Content -LiteralPath (Join-Path $taskRunDirectory 'verification.json') -Encoding UTF8
    if (-not $taskResult.freshWebViewProfile -or -not $taskResult.isolatedNativeData) { throw 'Application data isolation was not verified.' }
    [pscustomobject]@{ Phase='Finished'; Report=(Join-Path $taskRunDirectory 'verification.json'); FreshProfile=$taskResult.freshWebViewProfile; QQListening=$taskResult.qqListening; WeChatListening=$taskResult.wechatListening; QQArrived=$taskResult.qqRealArrival; WeChatAttention=$taskResult.wechatAttention } | ConvertTo-Json -Compress
    if (-not ($taskResult.defaultQQEnabled -and $taskResult.defaultWeChatEnabled -and $taskResult.qqListening -and $taskResult.wechatListening -and $taskResult.qqRealArrival -and $taskResult.wechatAttention)) {
        throw 'First-run message reception was not verified. Inspect verification.json; both clients must receive a real message during observation.'
    }
} finally {
    if ($taskProcess -and -not $taskProcess.HasExited) { Stop-Process -Id $taskProcess.Id -ErrorAction SilentlyContinue }
    if ($taskOriginalProcesses.Count -gt 0) { Start-Process -FilePath $taskProductionExecutable -WorkingDirectory (Split-Path -Parent $taskProductionExecutable) -WindowStyle Hidden }
}
