param(
  [Parameter(Mandatory = $true, Position = 0)]
  [ValidateSet("codex", "claudeCode")]
  [string]$Provider,

  [Parameter(Mandatory = $true, Position = 1)]
  [ValidateSet("start", "end")]
  [string]$Event
)

# SessionStart / SessionEnd hook of Claude Code and Codex. Records which process and which
# terminal run the session, as agent-sessions\<session id>.json in the island's data folder, so
# the island can bring that window (and, in Orca, that tab) forward. SessionStart output is added
# to the conversation, so this prints nothing, and it never fails the hook (always exit 0).

$ErrorActionPreference = "Stop"

function Get-StatusDirectory {
  if ($env:FOCUSD_AGENT_STATUS_DIR) { return $env:FOCUSD_AGENT_STATUS_DIR }
  if ($env:APPDATA) { return Join-Path $env:APPDATA "com.focusd.island" }
  return Join-Path $env:LOCALAPPDATA "com.focusd.island"
}

# The agent's own process: the nearest ancestor of this hook named like the agent.
function Find-AgentProcess {
  param([string]$Provider)
  $names = if ($Provider -eq "codex") { @("codex.exe", "node.exe") } else { @("claude.exe", "node.exe") }
  # [wmi] is about twice as fast as Get-CimInstance here, which matters for Codex: its hooks
  # cannot run in the background yet, so this delays its first turn.
  $process = [wmi]"Win32_Process.Handle='$PID'"
  for ($depth = 0; $depth -lt 6 -and $process; $depth++) {
    $parent = $null
    try { $parent = [wmi]"Win32_Process.Handle='$($process.ParentProcessId)'" } catch { }
    if (-not $parent) { return $null }
    if ($names -contains $parent.Name.ToLowerInvariant()) { return $parent }
    $process = $parent
  }
  return $null
}

try {
  [Console]::InputEncoding = New-Object System.Text.UTF8Encoding $false
  $hook = [Console]::In.ReadToEnd() | ConvertFrom-Json
  $sessionId = [string]$hook.session_id
  if ($sessionId -notmatch '^[A-Za-z0-9_-]{1,128}$') { exit 0 }

  $directory = Join-Path (Get-StatusDirectory) "agent-sessions"
  New-Item -ItemType Directory -Force -Path $directory | Out-Null
  $path = Join-Path $directory "$sessionId.json"
  $now = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()

  if ($Event -eq "start") {
    $agent = Find-AgentProcess -Provider $Provider
    $record = [ordered]@{
      provider = $Provider
      sessionId = $sessionId
      source = [string]$hook.source
      cwd = [string]$hook.cwd
      startedAt = $now
      pid = if ($agent) { [int64]$agent.ProcessId } else { $null }
      pidStarted = if ($agent) { [int64][Management.ManagementDateTimeConverter]::ToDateTime($agent.CreationDate).ToUniversalTime().ToFileTimeUtc() } else { $null }
      orcaHandle = $env:ORCA_TERMINAL_HANDLE
      wtSession = $env:WT_SESSION
      termProgram = $env:TERM_PROGRAM
    }
    # Records of terminals long gone; the island ignores them after two days anyway.
    Get-ChildItem -LiteralPath $directory -Filter *.json |
      Where-Object { $_.LastWriteTimeUtc -lt [DateTime]::UtcNow.AddDays(-7) } |
      Remove-Item -Force -ErrorAction SilentlyContinue
  } else {
    if (-not (Test-Path -LiteralPath $path)) { exit 0 }
    $record = Get-Content -LiteralPath $path -Raw -Encoding UTF8 | ConvertFrom-Json
    $record | Add-Member -NotePropertyName endedAt -NotePropertyValue $now -Force
    $record | Add-Member -NotePropertyName endReason -NotePropertyValue ([string]$hook.reason) -Force
  }

  $json = $record | ConvertTo-Json -Compress
  $temporary = "$path.tmp"
  [System.IO.File]::WriteAllText($temporary, $json, (New-Object System.Text.UTF8Encoding $false))
  Move-Item -LiteralPath $temporary -Destination $path -Force
} catch {
  # A missing record only costs the island a less exact window match.
}
exit 0
