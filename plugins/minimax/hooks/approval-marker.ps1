param([ValidateSet('record', 'post', 'clear')][string]$Mode = 'record')
$ErrorActionPreference = 'Stop'

$buffer = New-Object char[] 16384
$length = [Console]::In.ReadBlock($buffer, 0, $buffer.Length)
if ($length -eq 0 -or $length -eq $buffer.Length) { exit 0 }
try { $hook = [string]::new($buffer, 0, $length) | ConvertFrom-Json } catch { exit 0 }
$session = [string]$hook.session_id
$tool = [string]$hook.tool_name
if ([string]::IsNullOrWhiteSpace($session) -or $session.Length -gt 256) { exit 0 }
if ($Mode -eq 'record' -and ([string]::IsNullOrWhiteSpace($tool) -or $tool.Length -gt 256)) { exit 0 }

$dir = Join-Path $env:LOCALAPPDATA 'fly-island-minimax'
$file = Join-Path $dir 'approvals.json'
if ($Mode -ne 'record' -and -not [IO.File]::Exists($file)) { exit 0 }
$mutex = [Threading.Mutex]::new($false, 'Local\FlyIslandMiniMaxApprovals')
$held = $false
try {
    try { $held = $mutex.WaitOne(1000) } catch [Threading.AbandonedMutexException] { $held = $true }
    if (-not $held) { exit 0 }
    $now = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
    $items = @()
    if ([IO.File]::Exists($file) -and (Get-Item -LiteralPath $file).Length -le 65536) {
        try { $items = @(([IO.File]::ReadAllText($file) | ConvertFrom-Json).approvals) } catch { $items = @() }
    }
    $items = @($items | Where-Object {
        $_ -and $_.at -ge ($now - 1800000) -and $_.at -le $now -and
            ($_.sessionId -cne $session -or ($Mode -eq 'post' -and $_.tool -cne $tool))
    })
    if ($Mode -eq 'record') {
        $items = @($items | Sort-Object -Property at -Descending | Select-Object -First 39)
        $items += @{ sessionId = $session; tool = $tool; at = $now }
    }
    [void][IO.Directory]::CreateDirectory($dir)
    $temporary = Join-Path $dir ([Guid]::NewGuid().ToString('N') + '.tmp')
    try {
        [IO.File]::WriteAllText($temporary, (@{ approvals = $items } | ConvertTo-Json -Depth 4 -Compress), [Text.UTF8Encoding]::new($false))
        if ([IO.File]::Exists($file)) { [IO.File]::Replace($temporary, $file, [NullString]::Value) }
        else { [IO.File]::Move($temporary, $file) }
    } finally { if ([IO.File]::Exists($temporary)) { [IO.File]::Delete($temporary) } }
} finally {
    if ($held) { $mutex.ReleaseMutex() }
    $mutex.Dispose()
}
