# AI Agent Status Hooks

FocuSD can mirror Codex and Claude Code task activity on the collapsed island status light:

- running task: blue
- completed, idle, or no task: green
- failed task, or a running marker older than 10 minutes without a stop event: yellow

Do not use process or CPU detection for this integration. Codex and Claude Code can stay alive while idle, and Claude Code may run inside a VSCode terminal. The reliable path is to wire into lifecycle hooks.

## User Setup

For release users and source builds, use the in-app installer:

1. Open FocuSD Island.
2. Expand the island and open Settings.
3. In **AI Agent 状态灯**, click **安装/修复**.
4. Restart Codex and any VSCode terminal running Claude Code.
5. For Codex, review and trust the new hooks when Codex prompts you, or use `/hooks`.

The installer writes the hook scripts to the current user's app data directory:

```text
%APPDATA%\com.focusd.island\
```

It then updates:

```text
%USERPROFILE%\.codex\config.toml
%USERPROFILE%\.claude\settings.json
```

The operation is repeatable. Running **安装/修复** again rewrites FocuSD's managed hooks to the current app-data script path and removes older FocuSD hook entries that referenced development paths such as `D:\FocuSD\scripts`.

## Runtime Contract

Prompt submission uses a fast marker file instead of PowerShell JSON work:

```text
agent-codex-running.flag
agent-claudeCode-running.flag
```

FocuSD polls these marker files every 200ms. If either marker exists and is fresh, the island turns blue. If a marker is still present after 10 minutes, FocuSD treats it as stale and turns the island yellow instead of leaving the user waiting on a permanent blue light.

When the turn finishes, `focusd-agent-status.ps1` removes the marker, writes `agent-status.json`, and keeps a short hold marker when the task completed too quickly. This makes very short prompts still visibly flash blue for about 800ms.

`agent-status.json` uses this shape:

```json
{
  "codex": {
    "phase": "running",
    "taskId": "optional-id",
    "updatedAt": 1783584000000
  },
  "claudeCode": {
    "phase": "completed",
    "taskId": "optional-id",
    "updatedAt": 1783584000000
  },
  "updatedAt": 1783584000000
}
```

`phase === "running"` turns the light blue. `phase === "failed"` turns the light yellow. Missing files, invalid JSON, missing fields, unknown phases, `idle`, and `completed` are treated as green states. A derived `stale` phase is returned by the app when a running marker remains for more than 10 minutes without a later status update.

## Session Titles

The `UserPromptSubmit` hooks call the running script with a second argument, `capture`:

```text
focusd-agent-running.cmd codex capture
focusd-agent-running.cmd claudeCode capture
```

With `capture`, the script also copies the hook's stdin JSON to `agent-codex-hook-input.json` / `agent-claudeCode-hook-input.json` (written to a temp file, then moved). `PreToolUse` does not capture, because tool input can be whole files. Without the argument the script behaves exactly as before, so hooks installed by older versions keep lighting the island; they just show no title until **安装/修复** is clicked again.

`get_agent_status` adds an optional `title` to each provider. It is resolved from the saved input and never written to `agent-status.json`:

- Claude Code: the newest `ai-title` record in `transcript_path` (only files under `~/.claude/projects`), else the first typed prompt in the transcript, else the latest prompt, else the `cwd` folder name.
- Codex: `thread_name` for `session_id` in `~/.codex/session_index.jsonl`, else the first prompt seen for the session while the app runs, else the `cwd` folder name.

Titles are cut to 40 characters. Clearing a provider's status also deletes its saved hook input. Design notes: [architecture/agent-session-title.md](architecture/agent-session-title.md).

## Manual Smoke Test

After using the in-app installer, run these commands with the app-data scripts:

```powershell
$dir = Join-Path $env:APPDATA 'com.focusd.island'
& "$dir\focusd-agent-running.cmd" codex
powershell -NoProfile -ExecutionPolicy Bypass -File "$dir\focusd-agent-status.ps1" codex completed

& "$dir\focusd-agent-running.cmd" claudeCode
powershell -NoProfile -ExecutionPolicy Bypass -File "$dir\focusd-agent-status.ps1" claudeCode completed

powershell -NoProfile -ExecutionPolicy Bypass -File "$dir\focusd-agent-status.ps1" claudeCode failed
```

Expected behavior:

- The island turns blue after the `focusd-agent-running.cmd` command.
- The island returns green after the `focusd-agent-status.ps1 ... completed` command.
- The island turns yellow after the `focusd-agent-status.ps1 ... failed` command and returns green after clearing that status from the app.

## Notes For Manual Configuration

Manual configuration is usually unnecessary. Prefer the in-app installer because it uses the user's actual app-data path and handles Claude Code's Windows command behavior.

If you do edit Claude Code hooks manually on Windows, prefer Claude Code's exec form: put `cmd.exe` or `powershell.exe` in `command` and pass every argument through `args`. This avoids shell-selection differences between VSCode, Git Bash, PowerShell, and `cmd.exe`.
