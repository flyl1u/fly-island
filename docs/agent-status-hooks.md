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

Waiting is told by hooks that save their input: Claude Code's `PermissionRequest` (fires before every permission prompt) and `Notification` (matcher `permission_prompt|elicitation_dialog|agent_needs_input`), and Codex's `PermissionRequest`:

```text
focusd-agent-running.cmd claudeCode notification
focusd-agent-running.cmd codex notification
```

With `notification`, the script copies the hook's stdin JSON (session id, the event or notification type, the tool name or a short message such as "Claude needs your permission to use Bash"; no prompt) to `agent-<provider>-notification.json` (temp file, then moved) and leaves the running marker alone. It prints nothing, so a `PermissionRequest` hook makes no decision and the normal approval prompt follows. A session is listed as `waiting` while its transcript (or Codex rollout) has not changed since then (2 s slack): answering the prompt runs the tool and the transcript grows. A waiting session never turns stale. `idle_prompt` is not counted: it comes after the turn ended. Clearing an agent's status deletes its saved notification.

**Session records.** `SessionStart` and `SessionEnd` (both agents) run `focusd-agent-session.ps1 <provider> start|end`. The start writes `agent-sessions/<session id>.json`: the source (`startup`, `resume`, `clear`, `compact`, `fork`), the folder, the agent's process id and start time (the nearest ancestor of the hook named `claude.exe` / `codex.exe` / `node.exe`, looked up through WMI), `ORCA_TERMINAL_HANDLE`, `WT_SESSION` and `TERM_PROGRAM`. The end adds `endedAt` and the reason (`clear`, `resume`, `logout`, `prompt_input_exit`, `other`). It prints nothing, never fails the hook, only accepts session ids made of letters, digits, `-` and `_`, and deletes records older than 7 days. The process lookup takes about a second, so Claude Code runs the start hook with `async: true` (in the background). Codex hooks cannot run in the background yet, so a Codex session's first turn waits for it once. These records come from documented hooks and are preferred over Claude Code's undocumented `~/.claude/sessions` registry (`session_records.rs`). After `/clear` or `/resume` the process carries on under a new id, so the old record still leads to it. Codex reviews new hooks before running them: after Install/Repair, trust them with `/hooks`.

The settings page reads `get_agent_hooks_state` when it opens and after **安装/修复**. It builds the hooks Install/Repair would write and compares: each agent is `current` when all of them are there as written, `outdated` when FocuSD hooks differ (for example installed before the `Notification` hook, or pointing at an old script folder), or `notInstalled`; it also reports whether the app-data scripts differ from the ones in this build. When anything is outdated, the page shows a yellow notice and highlights **安装/修复**; nothing is changed until the user clicks it. Design notes: [architecture/agent-session-title.md](architecture/agent-session-title.md).

**Bringing the window forward**: Windows refuses to activate another app's window unless the island got the last input, so the island attaches to the foreground thread's input first (`win32::window::force_foreground`). If Windows still keeps the window behind, its taskbar button flashes and the click counts as found. **Diagnosing**: each click appends one line to `agent-focus.log` in the app data folder (`%APPDATA%\com.focusd.island`), naming each step and its result (for example `process=registry(5), tab=process, window=orca | focused`), without window titles or conversation text; ask for it when someone reports "没找到对应的窗口". An ended session that was never seen running by an island with this version cannot be traced and says so ("会话可能已经关掉了").

## Session Source

Each session on the Agent page can show where it runs, as the program's own icon and/or name before its status ("Orca · 正在运行 · 刚刚"). **Settings → AI Agent → 会话来源** picks icon and name (default), icon only (the name shows on hover), name only, or hidden (`agentHostDisplay` in `focusd-island-settings`).

- **Claude Code**: `list_agent_sessions` finds each running session's process the same way window switching does (below) and takes the executable of the nearest ancestor with a window, skipping Explorer and other shell hosts (`agent_status/session_host.rs`). Known executables get a product name (Orca, Windows Terminal, VS Code, Cursor, ...); others show their file name. A host found once is remembered while the island runs, so a session keeps its source after it ends; sessions that ended before the island started have none. Windows are only enumerated when a running session has no known host yet.
- **Codex**: the `originator` of the rollout's `session_meta` ("Codex Desktop", `codex_cli_rs`, `codex_vscode`) gives Codex, Codex CLI or VS Code, without an executable.
- **Icons**: `get_agent_host_icon(path)` extracts the executable's large icon (`win32/icon.rs`) and returns a PNG data URL, cached per path. It only reads existing absolute `.exe` files. A host without an executable or icon gets a generic terminal, editor or app icon.

## Session List Settings

**Settings → AI Agent** also sets, in `focusd-island-settings`: how far back the list goes (`agentSessionHours`: 1, 2 (default), 6 or 24 hours, passed to `list_agent_sessions` as `windowHours`); whether Claude Code and Codex sessions are shown (`agentShowClaudeCode`, `agentShowCodex`; hidden agents also leave the island's running count); only sessions in progress (`agentHideFinished`); and, per card, the running time (`agentShowElapsed`) and the model (`agentShowModel`).

**Running time** counts from the newest typed prompt: Claude Code's last real `user` record, Codex's last `user_message` / `task_started` (`turnStartedAt` in each summary). A session in progress shows "已运行 3 分 20 秒", ticking every second in its own leaf component; a finished one shows "用时 …" up to its last write. When a long turn pushes the prompt out of the 256 KiB tail read, the start found earlier is kept; if it was never seen, no time is shown.

**Finished but not looked at.** A session whose turn completed or failed stays bright on the Agent page (title at full brightness, glowing dot) until the user clicks it there or its window comes to the front. While any session waits to be seen, the island asks `agent_sessions_in_front` every two seconds (focus.rs): a session counts as in front when the foreground window belongs to its process or one of its ancestors (the terminal or editor it runs in), found as in "Switching to a Session's Window" below; Explorer and other shell hosts never count, and a session with no known process never does. Turns are told apart by their prompt time, so the next turn of a session is unseen again. The state is kept in memory only: sessions that finished before the island started count as seen.

**Permission mode and subagents** (`session_mode.rs`, `permissionMode` and `subagents` in each summary). Claude Code writes `permissionMode` on each typed prompt (`bypassPermissions`, `auto`, `acceptEdits`, `plan`, `default`); the newest one in the tail is used, and the one found earlier is kept when a long turn pushes the prompt out. Codex's `turn_context` gives `approval_policy` and `sandbox_policy`: `never` with `danger-full-access` counts as bypass, `never` otherwise as auto. A session in progress gets a badge for any mode but the default ("跳过确认" in orange, "自动", "自动改文件", "计划"). Subagents are the `Agent` (formerly `Task`) calls of the current turn with no `tool_result` yet, shown as "2 个子 Agent" while the turn runs; a subagent started in the background answers at once, so it is not counted. Compacting the context is not in the transcript until it is done, so it is not shown; it needs the `PreCompact` / `PostCompact` hooks.

## Switching to a Session's Window

Clicking a session on the Agent page calls `focus_agent_window` (`provider`, `cwd`, `title`, and the optional `sessionId`). It tries, in order:

0. **The session's SessionStart record** (above): its process if it still runs with the recorded start time, and its Orca tab. Works for Claude Code and Codex.
1. **What was seen of the session before** (`agent-sessions-seen.json` in the app data folder, `session_memory.rs`). Every time the session list is read, each running Claude Code session not seen yet is recorded with its process id and start time, its host program and its Orca terminal, and kept for two days. `/clear` and `/resume` give a session a new id while its process and tab carry on, and an ended session leaves Claude Code's registry, so this is how such a session still finds its window: the remembered process is followed if it still runs with the same start time, else the remembered program's window is preferred.
2. **The session's own process, from Claude Code's registry.** Claude Code records each running session in `~/.claude/sessions/<pid>.json` (`pid`, `sessionId`, `procStart`). The recorded start time must match the live process, so a reused process id is ignored. From that process the island walks up the parent chain (`claude` → `pwsh` → terminal or editor) and focuses the nearest ancestor's window, skipping Explorer and other shell hosts. When that process owns several windows (an editor with several folders open), the folder or title picks one. This works in any terminal or editor, including ones whose window title says nothing about the session.
3. **Orca's window**, when the session's Orca terminal is known (below) but its process is gone.
4. **Orca's list**, when no process is known and Orca is open: `orca terminal list --json`, using a tab only when exactly one live tab of that agent has the session's title (Orca shows the title Claude Code sets; a title the island cut short matches the start of the tab title), or, for Codex, when it is the only Codex tab in the session's folder.
5. **Title and folder matching**: editors whose title names the folder (markers such as "●", "(Workspace)" and "[Administrator]" are ignored, and a folder above the session's, such as the repository of a worktree, also counts), terminals whose title is the session title, then the Codex app.

**Orca** runs many terminals in one window titled "Orca". After its window comes to the front, the island also runs `orca terminal switch --terminal <handle>` with the CLI shipped next to Orca (`<Orca.exe folder>\resources\bin\orca.exe`). The CLI is started without a console and not waited for, because it takes a few seconds to reach Orca. The handle comes from the session record above. Installs from before it ran `focusd-agent-running.cmd claudeCode session` from SessionStart instead, which saved the hook input as `agent-terminals/<handle>.json` inside Orca; those files are still read (only `term_<hex and ->` names, deleted after 7 days). The handle is looked up in this order: (1) for a **running** Claude Code session, its own process's `ORCA_TERMINAL_HANDLE`, read from the process environment (`win32/process_env.rs`; Windows has no API for another process's environment, so it reads the PEB's process parameters, and anything that does not read back cleanly is ignored). This needs no hook and finds sessions opened before the hook was installed; (2) the session record, then the older `agent-terminals` record, which still cover sessions that have ended while their tab stays open; (3) for **Codex**, which has neither, `orca terminal list --json` (about a second; given up after 6 s): only when exactly one live terminal runs Codex in the session's folder is it used, so the island never guesses between several. Split panes in one Orca tab may share the tab: `terminal switch` brings the tab forward.
**Windows Terminal** keeps every tab of a window in one window, and has no command to switch to a tab by session ([microsoft/terminal#19783](https://github.com/microsoft/terminal/issues/19783)). After a Windows Terminal window comes to the front, the island reads the names of its tabs through UI Automation (`win32/uia_tabs.rs`, each call given up after 1 s) and selects the tab whose title is the session title, the title Claude Code sets, with the glyph in front ignored. A title the island cut short matches a tab title that starts with it. Only a tab that alone carries the title is selected, so the island never guesses between two tabs with the same title. When the tab is in another window of the same Windows Terminal process, that window is brought forward instead. The log notes `wt-tab=selected` or `wt-tab=none`; with `none` only the window is brought forward. Codex does not set the tab title, so its tabs are matched only when their title happens to be the session title.

**VS Code** and editors built on it (Cursor, Windsurf, VSCodium, Trae, Kiro) have no way to select one of their terminals from outside. With the **FocuSD Island extension** (`tixxin.focusd-island`, source in `packages/vscode-extension/`) installed in that editor, after the editor window comes to the front the island opens `<scheme>://tixxin.focusd-island/focus?pids=<session process chain>&title=<session title>` (`vscode`, `vscode-insiders`, `cursor`, `windsurf`, `vscodium`, `trae`, `kiro`). The editor hands the link to the window used last, which is the one just brought forward, and the extension shows the terminal whose shell is one of those processes, or else the only terminal named like the session; it does nothing when none matches. The island first looks for a `tixxin.focusd-island-<version>` folder in the editor's extensions folder (`~/.vscode/extensions`, `~/.cursor/extensions`, ...; ignoring ones listed in `.obsolete`), since opening the link without the extension would make the editor offer to install it. It also skips the link when Windows kept the window behind. The log notes `editor-terminal=sent`, `no-extension` or `failed`.

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
