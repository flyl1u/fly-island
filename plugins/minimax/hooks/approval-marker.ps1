# 记录 MiniMax Code 正在等审批的会话，供小岛插件读取。
#
# 只挂在 PermissionRequest 上：把会话 id、工具名和时间写进
# %LOCALAPPDATA%\fly-island-minimax\approvals.json。
# 审批结束后的清理不放这里：PostToolUse / Stop / UserPromptSubmit 用一条 cmd 直接删文件，
# 免得每调用一次工具都启动一次 PowerShell。
$ErrorActionPreference = 'Stop'
$dir = Join-Path $env:LOCALAPPDATA 'fly-island-minimax'
$file = Join-Path $dir 'approvals.json'

$raw = [Console]::In.ReadToEnd()
if (-not $raw) { exit 0 }
try { $hook = $raw | ConvertFrom-Json } catch { exit 0 }
$session = [string]$hook.session_id
if (-not $session) { exit 0 }

$items = @()
if (Test-Path -LiteralPath $file) {
  try { $items = @((Get-Content -LiteralPath $file -Raw -Encoding UTF8 | ConvertFrom-Json).approvals) } catch { $items = @() }
}
# 同一会话只留最新一条，已经批过的旧标记不让它越堆越多。
$entry = [pscustomobject]@{
  sessionId = $session
  tool = [string]$hook.tool_name
  at = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
}
$items = @($items | Where-Object { $_ -and $_.sessionId -ne $session }) + $entry

New-Item -ItemType Directory -Force -Path $dir | Out-Null
[IO.File]::WriteAllText($file, (@{ approvals = $items } | ConvertTo-Json -Depth 4 -Compress), [Text.UTF8Encoding]::new($false))
exit 0
