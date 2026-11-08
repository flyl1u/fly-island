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

The operation is repeatable. Running **安装/修复** again rewrites FocuSD's managed hooks to the current app-data script path and removes older FocuSD hook entries that referenced development paths such as `D:\FocuSD\scripts`. FocuSD hooks under events it no longer writes are removed too, and an event left with no hooks is dropped.

While the approval endpoint runs (approving on the island), Claude Code also gets the approval hooks: an HTTP `PermissionRequest` hook, a `PreToolUse` hook for `AskUserQuestion`, and an activity hook on `PostToolUse`, `PostToolUseFailure`, `PermissionDenied`, `Stop`, `SubagentStop` and `UserPromptSubmit`. The activity hook runs `curl.exe` (part of Windows 10 and 11) in the background (`"async": true`) to post the hook's input to `/claude/activity`; it never delays Claude Code, and with the island closed it gives up after a second. It lets the island close a card whose request was already answered in the terminal (docs/architecture/agent-island-interaction.md, 第 2 条). Installs from before 2026-11-07 lack it and show as needing repair.

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

Waiting is told by hooks that save their input: Claude Code's `PermissionRequest` (fires before every permission prompt) and `Notification` (matcher `permission_prompt|elicitation_dialog|agent_needs_input`), and Codex's `PermissionRequest`. Claude Code's `PreCompact` and `PostCompact` save their input the same way: from one to the other the session is compacting its context, which writes nothing to the transcript for up to a couple of minutes, so the Agent page says "Compacting context" and keeps it running (taken as over after 10 minutes in case `PostCompact` never comes). The waiting hooks:

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

**Sessions that never say they ended.** A session quit mid-turn is listed as finished when its SessionStart record says so (SessionEnd ran, or the recorded process is gone). A Claude Code session the hooks did not record falls back on Claude Code's own registry (`~/.claude/sessions/<pid>.json`): once its file has been quiet for 30 seconds and its id is not among the live registered processes, it counts as finished. Sessions closed in the VS Code extensions often skip SessionEnd (Codex runs it only after the conversation has been idle for 30 minutes), so the Agent page also lets the user archive a row by hand: a grey archive button right of the provider icon shows while the cursor is on the row; the row slides out and folds away, and a "已归档 · 撤销" pill floats at the list's bottom left for 5 seconds (undo unfolds the row back). Archiving only hides the session (`focusd-island-agent-hidden-sessions` in localStorage), from the list, the running count and the collapsed island; nothing is deleted, and a removed session that writes to its file again comes back.

**Waiting on you, looked at.** A session waiting on the user (an approval, a question, a turn that ended asking) or failed stops asking once the user has looked at it, the same way as below: it leaves the session ring's count, its dot goes grey and no reminder follows, while its row still says what it waits for (roadmap B15, docs/architecture/agent-session-states.md).

**Finished but not looked at.** A session whose turn completed or failed stays bright on the Agent page (title at full brightness, glowing dot) until the user clicks it there or its window comes to the front. While any session waits to be seen, the island asks `agent_sessions_in_front` every two seconds (focus.rs): a session counts as in front when the foreground window belongs to its process or one of its ancestors (the terminal or editor it runs in), found as in "Switching to a Session's Window" below; Explorer and other shell hosts never count, and a session with no known process never does. Turns are told apart by their prompt time, so the next turn of a session is unseen again. The state is kept in memory only: sessions that finished before the island started count as seen.

**Permission mode and subagents** (`session_mode.rs`, `permissionMode` and `subagents` in each summary). Claude Code writes `permissionMode` on each typed prompt (`bypassPermissions`, `auto`, `acceptEdits`, `plan`, `default`); the newest one in the tail is used, and the one found earlier is kept when a long turn pushes the prompt out. Codex's `turn_context` gives `approval_policy` and `sandbox_policy`: `never` with `danger-full-access` counts as bypass, `never` otherwise as auto. A session in progress gets a badge for any mode but the default ("跳过确认" in orange, "自动", "自动改文件", "计划"). Subagents are the `Agent` (formerly `Task`) calls of the current turn with no `tool_result` yet, shown as "2 个子 Agent" while the turn runs; a subagent started in the background answers at once, so it is not counted. Compacting the context is not in the transcript until it is done, so it is not shown; it needs the `PreCompact` / `PostCompact` hooks.

## Switching to a Session's Window

Clicking a session on the Agent page calls `focus_agent_window` (`provider`, `cwd`, `title`, and the optional `sessionId`). It tries, in order:

0. **The session's SessionStart record** (above): its process if it still runs with the recorded start time, and its Orca tab. Works for Claude Code and Codex.
1. **What was seen of the session before** (`agent-sessions-seen.json` in the app data folder, `session_memory.rs`). Every time the session list is read, each running Claude Code session not seen yet is recorded with its process id and start time, its host program and its Orca terminal, and kept for two days. `/clear` and `/resume` give a session a new id while its process and tab carry on, and an ended session leaves Claude Code's registry, so this is how such a session still finds its window: the remembered process is followed if it still runs with the same start time, else the remembered program's window is preferred.
2. **The session's own process, from Claude Code's registry.** Claude Code records each running session in `~/.claude/sessions/<pid>.json` (`pid`, `sessionId`, `procStart`). The recorded start time must match the live process, so a reused process id is ignored. From that process the island walks up the parent chain (`claude` → `pwsh` → terminal or editor) and focuses the nearest ancestor's window, skipping Explorer and other shell hosts. When that process owns several windows (an editor with several folders open), the folder or title picks one. This works in any terminal or editor, including ones whose window title says nothing about the session.
3. **Orca's window**, when the session's Orca terminal is known (below) but its process is gone.
4. **Orca's list**, when no process is known and Orca is open: `orca terminal list --json`, using a tab only when exactly one live tab of that agent has the session's title (Orca shows the title Claude Code sets; a title the island cut short matches the start of the tab title), or, for Codex, when it is the only Codex tab in the session's folder.
When a session's parent chain breaks before its terminal (Git Bash's fork and exec, as when Happy starts the session, leaves a parent that has already exited), its host comes from the environment it inherited (`session_host.rs`): `TERM_PROGRAM` names the innermost terminal (`WezTerm` with `WEZTERM_EXECUTABLE`, `vscode` with `VSCODE_GIT_ASKPASS_NODE`, `mintty` for Git Bash), else `WT_SESSION` means Windows Terminal. That host gives the session its icon and is the program preferred in step 1.
5. **Title and folder matching**: editors whose title names the folder (markers such as "●", "(Workspace)" and "[Administrator]" are ignored, and a folder above the session's, such as the repository of a worktree, also counts), terminals whose title is the session title, then the Codex app.

**Orca** runs many terminals in one window titled "Orca". After its window comes to the front, the island also runs `orca terminal switch --terminal <handle>` with the CLI shipped next to Orca (`<Orca.exe folder>\resources\bin\orca.exe`). The CLI is started without a console and not waited for, because it takes a few seconds to reach Orca. The handle comes from the session record above. Installs from before it ran `focusd-agent-running.cmd claudeCode session` from SessionStart instead, which saved the hook input as `agent-terminals/<handle>.json` inside Orca; those files are still read (only `term_<hex and ->` names, deleted after 7 days). The handle is looked up in this order: (1) for a **running** Claude Code session, its own process's `ORCA_TERMINAL_HANDLE`, read from the process environment (`win32/process_env.rs`; Windows has no API for another process's environment, so it reads the PEB's process parameters, and anything that does not read back cleanly is ignored). This needs no hook and finds sessions opened before the hook was installed; (2) the session record, then the older `agent-terminals` record, which still cover sessions that have ended while their tab stays open; (3) for **Codex**, which has neither, `orca terminal list --json` (about a second; given up after 6 s): only when exactly one live terminal runs Codex in the session's folder is it used, so the island never guesses between several. Split panes in one Orca tab may share the tab: `terminal switch` brings the tab forward.
**Windows Terminal** keeps every tab of a window in one window, and has no command to switch to a tab by session ([microsoft/terminal#19783](https://github.com/microsoft/terminal/issues/19783)). After a Windows Terminal window comes to the front, the island reads the names of its tabs through UI Automation (`win32/uia_tabs.rs`, each call given up after 1 s) and selects the tab whose title is the session title, the title Claude Code sets, with the glyph in front ignored. A title the island cut short matches a tab title that starts with it. Only a tab that alone carries the title is selected, so the island never guesses between two tabs with the same title. When the tab is in another window of the same Windows Terminal process, that window is brought forward instead. The log notes `wt-tab=selected` or `wt-tab=none`; with `none` only the window is brought forward. Codex does not set the tab title, so its tabs are matched only when their title happens to be the session title.

**VS Code** and editors built on it (Cursor, Windsurf, VSCodium, Trae, Kiro) have no way to select one of their terminals from outside. With the **FocuSD Island extension** (`tixxin.focusd-island`, source in `packages/vscode-extension/`) installed in that editor, after the editor window comes to the front the island opens `<scheme>://tixxin.focusd-island/focus?pids=<session process chain>&title=<session title>` (`vscode`, `vscode-insiders`, `cursor`, `windsurf`, `vscodium`, `trae`, `kiro`). The editor hands the link to the window used last, which is the one just brought forward, and the extension shows the terminal whose shell is one of those processes, or else the only terminal named like the session; it does nothing when none matches. The island first looks for a `tixxin.focusd-island-<version>` folder in the editor's extensions folder (`~/.vscode/extensions`, `~/.cursor/extensions`, ...; ignoring ones listed in `.obsolete`), since opening the link without the extension would make the editor offer to install it. It also skips the link when Windows kept the window behind. The log notes `editor-terminal=sent`, `no-extension` or `failed`.

## Sessions on Other Computers

### Read over SSH (no setup on the server)

Settings → AI Agent → **Remote computers** lists the `Host` aliases in `~/.ssh/config`, and computers added on that page by address (user, host, port; kept in `agent-remote-hosts.json`, never in `~/.ssh/config`, and reached as `ssh -p <port> <user>@<host>`). For each one switched on, the island keeps one `ssh -F <island config> -o BatchMode=yes <alias> sh -s` open (the config is below; without it, `ssh -o BatchMode=yes -o ClearAllForwardings=yes <alias> sh -s`): the script is sent once, prints `FOCUSD_READY`, and then answers a request about every 3 seconds while sessions are listed (a request costs a few hundred milliseconds instead of a new login; a broken connection is opened again, after a minute when it failed). Each request reads that computer's Claude Code transcripts and Codex rollouts of the session window: for each file the first 40 lines (first prompt, starting folder, Codex's session meta) and the last 256 KiB, the same parts the local scan reads; unchanged files are only named, and a file whose head the island has gets only its tail. They go into `%APPDATA%\com.focusd.island\remote-sessions\<alias>\`, laid out like a home folder with the remote modification times, and the local scan reads that folder, so titles, models, effort and states work as for local sessions. `BatchMode` means key login only: a host that would ask for a password fails at once (its error shows on the settings row). The island config, `%APPDATA%\com.focusd.island\ssh\<alias>.conf`, is written from `ssh -G <alias>` each time a connection opens: every option the host resolves to except its own tunnels (`LocalForward`, `RemoteForward`, `DynamicForward`), control sockets, agent and X11 forwarding and the like, a `ProxyJump` turned into the `ProxyCommand` it means, and one `RemoteForward 127.0.0.1:0 127.0.0.1:<endpoint port>` with `ExitOnForwardFailure no`: port 0 lets the server's sshd pick a free port, so the forward never collides with another user's on a shared server, and ssh says which (`Allocated port N`, hence `LogLevel INFO`). The island passes that port and the host's approval token to the script, which keeps `<port there> <endpoint port> <node name> <token>` in `~/.focusd-island/approval-port` while it runs and deletes it when the connection ends. The script runs with `umask 077`, so that file (and the saved notifications) only you can read; the approval hooks take the token from it, so it is never written into `~/.claude/settings.json`, which other users of a shared server may be able to read. Your `~/.ssh/config` is only read. When the endpoint is not running, the config cannot be made, or connecting through it fails, the connection is opened without it, with `ClearAllForwardings`, so the sessions still come and the settings row says why approvals do not. The same run lists the ids in the server's `~/.claude/sessions` whose process is alive (`kill -0`; entries of other machines sharing the home, told by `pidDomain` and `/etc/machine-id`, count as alive), so a Claude Code session quit there is told as for a local one: no longer running, and left out under **Hide sessions that have quit**. The server needs only `sh`, `find`, GNU `stat`, `head`, `tail`, `sed` and `grep`. Without hooks there, a remote session never shows as waiting on you, and a Codex session quit mid-turn shows as running until it turns stale.

**Install/repair** and the **reply status marker** also act on every computer switched on here (`remote_setup.rs`): the island reads the file over the same SSH, changes it as it changes the local one, and writes it back through a full temporary copy and `cat`, so a dropped connection never cuts the file short. A file that is a symlink is not written, here or there (the link would be cut, or a file kept elsewhere, such as an instructions repository, changed); the result says so, and that file is yours to change. The marker is the rules file `~/.claude/rules/focusd-island-reply-marker.md` there as here (Claude Code loads `~/.claude/rules/*.md` at session start); switching it on shows its text first, switching it off deletes the file only when it is the island's, and a block an older version put in `~/.claude/CLAUDE.md` is taken out. The remote `~/.claude/settings.json` gets only `PermissionRequest`, the waiting `Notification`, `PreCompact` and `PostCompact` hooks (Claude Code only), each saving its input as one file in `~/.focusd-island/agent-notifications/`, as the local hook script does in `%APPDATA%\com.focusd.island\agent-notifications\`; the fetch above brings the folder along and drops files older than a day, and the newest file of each session decides, so two sessions waiting at once both show as waiting, and a compacting remote session shows so. The settings page lists each computer's result under the card.

**Approvals from a remote computer.** While the approval endpoint runs, Install/repair also writes approval hooks into each remote `~/.claude/settings.json`: `PermissionRequest`, `PreToolUse` for `AskUserQuestion`, and the activity events, as the local install has them, but as commands that read the port file and run `curl -s --noproxy '*' -H "Host: 127.0.0.1:<endpoint port>" … --data-binary @- http://127.0.0.1:<port there>/…`, rather than HTTP hooks, because Claude Code sends HTTP hooks through `http_proxy`, which on a server often leads back out to this computer's proxy with the token and the tool input. Each carries `X-FocuSD-Remote: <alias>` and a token of its own for that computer (a hash of the island's token and the alias), so a token copied from one server is good only for requests claiming that server. The request goes through the reverse forward of the session connection above to the island, which shows the card with the computer's name before the project; **Terminal** on such a card looks for a window by folder and title only. The fallback is the terminal: with no port file (no connection), one written on another node (a home shared by login nodes; the forward listens on one), a refused connection or the island gone, the command exits 1 without output (never 2, which would deny) and Claude Code asks there, as it also does while the card waits. Run Install/repair once after updating from a version without these hooks.

On a shared server, another user can listen on a loopback port but cannot write your home, so the hooks only post to the port your own connection got. What is left: should the script be killed outright (`kill -9`) its port file stays behind, and until the next connection writes a new one, a user who then took that port would get the hooks' requests. If the server refuses the forward, the settings row says approvals from that computer cannot reach the cards.

### Reported by the server

Claude Code or Codex running on another computer (an SSH server, a dev container, VS Code Remote) writes its session files and runs its hooks there, so the island cannot see it, and `127.0.0.1` in a hook there means that computer. Such a session can still be listed: a hook there reports it over the local API (below), through an SSH tunnel back to this computer, or a plugin reports it with `agentStatus.report`. A report that names the machine (`host`) and the agent (`agent`: `claudeCode` or `codex`) is listed on the Agent page with the local sessions, the machine's name in place of the program; clicking it says where it runs instead of looking for a window. Other reports only light the island, as before. Reports are kept in memory (gone after a restart), at most 16 sources at once.

1. Turn on the built-in **Local API** plugin and its "allow changes" switch. `%APPDATA%\com.focusd.island\local-api.json` has the `port` (usually 39271) and the `token`.
2. Forward that port, unchanged, from the server back to this computer. The local API only answers requests addressed to `127.0.0.1:<its port>`, so the port number must be the same on both ends. In `~/.ssh/config` on this computer:

   ```
   Host dev-box
     RemoteForward 39271 127.0.0.1:39271
   ```

3. On the server, save this as `~/.local/bin/focusd-remote-hook.sh` and make it executable. It needs `curl` and `python3`, gives up after a second and always exits 0, so a closed tunnel never holds the session up.

   ```sh
   #!/bin/sh
   # focusd-remote-hook.sh <running|waiting|completed|end> [claudeCode|codex]
   # Reports this session to FocuSD Island through the SSH tunnel. Needs FOCUSD_TOKEN.
   phase="$1"; agent="${2:-claudeCode}"; port="${FOCUSD_PORT:-39271}"
   input=$(cat)
   source=$(printf '%s' "$input" | python3 -c 'import json,sys; print("r-" + json.load(sys.stdin).get("session_id", "x")[:24].lower())') || exit 0
   url="http://127.0.0.1:$port/v1/agent-status/$source"
   if [ "$phase" = end ]; then
     curl -s -m 1 -X DELETE -H "Authorization: Bearer $FOCUSD_TOKEN" "$url" >/dev/null 2>&1
     exit 0
   fi
   body=$(printf '%s' "$input" | PHASE="$phase" AGENT="$agent" HOST_NAME="$(hostname)" python3 -c '
   import json, os, sys
   hook = json.load(sys.stdin)
   report = {"phase": os.environ["PHASE"], "agent": os.environ["AGENT"], "host": os.environ["HOST_NAME"][:64],
             "name": "Codex" if os.environ["AGENT"] == "codex" else "Claude Code"}
   if hook.get("cwd"): report["cwd"] = hook["cwd"][:260]
   if hook.get("prompt"): report["title"] = " ".join(hook["prompt"].split())[:120]
   print(json.dumps(report))') || exit 0
   curl -s -m 1 -X PUT -H "Authorization: Bearer $FOCUSD_TOKEN" -H "Content-Type: application/json" \
     --data "$body" "$url" >/dev/null 2>&1
   exit 0
   ```

4. Set `FOCUSD_TOKEN` on the server (for example in `~/.profile`) and add the hooks to `~/.claude/settings.json` there. Fields left out of a report keep their last value, so the title from the prompt stays after the turn ends.

   ```json
   {
     "hooks": {
       "UserPromptSubmit": [{ "hooks": [{ "type": "command", "command": "~/.local/bin/focusd-remote-hook.sh running" }] }],
       "Notification": [{ "hooks": [{ "type": "command", "command": "~/.local/bin/focusd-remote-hook.sh waiting" }] }],
       "Stop": [{ "hooks": [{ "type": "command", "command": "~/.local/bin/focusd-remote-hook.sh completed" }] }],
       "SessionEnd": [{ "hooks": [{ "type": "command", "command": "~/.local/bin/focusd-remote-hook.sh end" }] }]
     }
   }
   ```

   Codex takes the same script with `codex` as the second argument, on its `UserPromptSubmit`, `PermissionRequest` (waiting), `Stop` and `SessionEnd` hooks.

Without the tunnel the requests fail at once and nothing else changes. A remote session that never sends `end` can be removed from the Agent page by hand like any other.

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
