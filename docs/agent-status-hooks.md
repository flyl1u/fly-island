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

## Sessions, Titles and Waiting

Session titles and the island's Agent page do not depend on hooks: `list_agent_sessions` reads the Claude Code transcripts (`~/.claude/projects/*/*.jsonl`) and the Codex rollouts (`~/.codex/sessions/`) of the last two hours directly. Titles come from Claude Code's `ai-title` records or the Codex `thread_name` in `~/.codex/session_index.jsonl`, else the first typed prompt, else the project folder. Earlier versions copied the prompt-submit hook input (`capture`, `agent-*-hook-input.json`) for this; that copy held the whole prompt and is gone. Install/Repair deletes leftover copies, and the script ignores the `capture` argument older installs still pass.

The only hook input still saved is Claude Code's `Notification` hook, installed with the matcher `permission_prompt|elicitation_dialog`:

```text
focusd-agent-running.cmd claudeCode notification
```

With `notification`, the script copies the hook's stdin JSON (session id, notification type, a short message such as "Claude needs your permission to use Bash"; no prompt) to `agent-claudeCode-notification.json` (temp file, then moved) and leaves the running marker alone. A session is listed as `waiting` while its transcript has not changed since such a notification (2 s slack): answering the prompt runs the tool and the transcript grows. A waiting session never turns stale. Codex has no equivalent hook, so Codex sessions are never `waiting`. Clearing Claude Code's status deletes the saved notification.

The settings page reads `get_agent_hooks_state` when it opens and after **安装/修复**. It builds the hooks Install/Repair would write and compares: each agent is `current` when all of them are there as written, `outdated` when FocuSD hooks differ (for example installed before the `Notification` hook, or pointing at an old script folder), or `notInstalled`; it also reports whether the app-data scripts differ from the ones in this build. When anything is outdated, the page shows a yellow notice and highlights **安装/修复**; nothing is changed until the user clicks it. Design notes: [architecture/agent-session-title.md](architecture/agent-session-title.md).
## Other Agents

Tools other than Codex and Claude Code can report their status too, with no FocuSD release needed: either from a plugin with the `agent-status:write` permission (`agentStatus.report`), or over the local API (`PUT /v1/agent-status/{source}`). These reports are kept in memory only and appear in the snapshot's `others` list. They light the island and name their session in the same way as the built-in agents, using a robot icon instead of a brand icon. See [local-api.md](local-api.md#ai-agent-状态) and [plugins/README.md](plugins/README.md).

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
