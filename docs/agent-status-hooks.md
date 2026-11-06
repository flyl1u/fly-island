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

## Session Source

Each session on the Agent page can show where it runs, as the program's own icon and/or name before its status ("Orca · 正在运行 · 刚刚"). **Settings → AI Agent → 会话来源** picks icon and name (default), icon only (the name shows on hover), name only, or hidden (`agentHostDisplay` in `focusd-island-settings`).

- **Claude Code**: `list_agent_sessions` finds each running session's process the same way window switching does (below) and takes the executable of the nearest ancestor with a window, skipping Explorer and other shell hosts (`agent_status/session_host.rs`). Known executables get a product name (Orca, Windows Terminal, VS Code, Cursor, ...); others show their file name. A host found once is remembered while the island runs, so a session keeps its source after it ends; sessions that ended before the island started have none. Windows are only enumerated when a running session has no known host yet.
- **Codex**: the `originator` of the rollout's `session_meta` ("Codex Desktop", `codex_cli_rs`, `codex_vscode`) gives Codex, Codex CLI or VS Code, without an executable.
- **Icons**: `get_agent_host_icon(path)` extracts the executable's large icon (`win32/icon.rs`) and returns a PNG data URL, cached per path. It only reads existing absolute `.exe` files. A host without an executable or icon gets a generic terminal, editor or app icon.

## Switching to a Session's Window

Clicking a session on the Agent page calls `focus_agent_window` (`provider`, `cwd`, `title`, and the optional `sessionId`). It tries, in order:

1. **The session's own process.** Claude Code records each running session in `~/.claude/sessions/<pid>.json` (`pid`, `sessionId`, `procStart`). The recorded start time must match the live process, so a reused process id is ignored. From that process the island walks up the parent chain (`claude` → `pwsh` → terminal or editor) and focuses the nearest ancestor's window, skipping Explorer and other shell hosts. When that process owns several windows (an editor with several folders open), the folder or title picks one. This works in any terminal or editor, including ones whose window title says nothing about the session.
2. **Orca's window**, when the session's Orca terminal is known (below) but its process is gone.
3. **Title and folder matching**, as before: editors whose title names the folder, terminals whose title is the session title, then the Codex app.

**Orca** runs many terminals in one window titled "Orca". After its window comes to the front, the island also runs `orca terminal switch --terminal <handle>` with the CLI shipped next to Orca (`<Orca.exe folder>\resources\bin\orca.exe`). The CLI is started without a console and not waited for, because it takes a few seconds to reach Orca. To know the handle, the Claude Code `SessionStart` hook runs:

```text
focusd-agent-running.cmd claudeCode session
```

Inside an Orca terminal (`ORCA_TERMINAL_HANDLE` is set), this saves the hook's stdin JSON (session id, transcript path, folder, start source; no prompt) as `agent-terminals/<handle>.json`. Elsewhere it does nothing. It prints nothing, because SessionStart output would be added to the conversation. Only file names of the form `term_<hex and ->` are used, and records older than 7 days are deleted when read. A session started before this hook was installed has no record until it is resumed, cleared or compacted; until then the island still brings Orca's window to the front. Codex sessions have neither the session registry nor this hook, so they keep title matching. Split panes in one Orca tab may share the tab: `terminal switch` brings the tab forward.
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
