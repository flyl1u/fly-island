export type SettingsAgentText = {
  title: string;
  install: string;
  installing: string;
  installed: string;
  currentStatus: string;
  clearing: string;
  clearStatus: string;
  scriptsDir: string;
  sessionTitleSection: string;
  sessionTitle: string;
  sessionTitleHint: string;
  sessionPageSection: string;
  sessionVisibleRows: string;
  sessionPageHint: string;
  hostDisplay: string;
  hostDisplayOptions: { both: string; icon: string; name: string; off: string };
  hostDisplayHint: string;
  sessionHours: string;
  sessionHoursOption: (hours: number) => string;
  sessionHoursHint: string;
  sessionCardSection: string;
  /** Settings → AI Agent → Remote computers (AgentRemoteHostsSettings): read over SSH. */
  remoteIntro: string;
  remoteRequirements: string;
  remoteHostsSection: string;
  remoteHostsFooter: string;
  remoteRefresh: string;
  remoteEmpty: string;
  remoteEmptyHint: string;
  remoteFromConfig: string;
  remoteFetching: string;
  remoteFetchedAt: (time: string, sessions: number) => string;
  remoteFailed: (reason: string) => string;
  remoteRemove: (name: string) => string;
  remoteAdd: string;
  remoteAddHint: string;
  remoteName: string;
  remoteNamePlaceholder: string;
  remoteUser: string;
  remoteUserPlaceholder: string;
  remoteHost: string;
  remoteHostPlaceholder: string;
  remotePort: string;
  remoteSave: string;
  remoteCancel: string;
  /** The group with a switch per agent kind. */
  agentsSection: string;
  showClaudeCode: string;
  showCodex: string;
  showAgentsHint: string;
  hideFinished: string;
  hideFinishedHint: string;
  hideClosed: string;
  hideClosedHint: string;
  showElapsed: string;
  showElapsedHint: string;
  showModel: string;
  showActivity: string;
  showActivityHint: string;
  showUsage: string;
  showUsageHint: string;
  alerts: {
    title: string;
    hint: string;
    started: string;
    startedOptions: Record<"everyTurn" | "newSession" | "off", string>;
    completed: string;
    failed: string;
    waiting: string;
    seconds: string;
    secondsValue: (seconds: number) => string;
    /** Reminding again about a session still waiting on the user (roadmap B6.4.1). */
    remind: string;
    remindDescription: string;
    remindValue: (seconds: number) => string;
    /** Claude's or Codex's usage reaching a level (roadmap B6.5.2). */
    quota: string;
    quotaDescription: string;
    quotaValue: (percent: number) => string;
  };
  /** Pushing agent events to the phone with Bark (roadmap B6.5.5). */
  push: {
    title: string;
    enabled: string;
    enabledHint: string;
    server: string;
    serverHint: string;
    key: string;
    keyHint: string;
    keyIsSaved: string;
    keyPlaceholder: string;
    saveKey: string;
    clearKey: string;
    keySaved: string;
    keyCleared: string;
    events: Record<"waiting" | "completed" | "failed", string>;
    away: string;
    awayHint: string;
    awayValue: (minutes: number) => string;
    test: string;
    testAction: string;
    testTitle: string;
    testBody: string;
    testSent: string;
    hint: string;
  };
  /** Approving agents' permission requests on the island (roadmap B6 phase 2). */
  approval: {
    title: string;
    onIsland: string;
    whenInFront: string;
    whenInFrontHint: string;
    hint: string;
  };
  /** Rules hiding agent sessions by folder or prompt text (roadmap B6.4.3). */
  filters: {
    title: string;
    hint: string;
    kinds: { folder: string; prompt: string };
    kindLabel: string;
    add: string;
    addButton: string;
    folderPlaceholder: string;
    promptPlaceholder: string;
    remove: (value: string) => string;
  };
  /** The optional reply status marker in the user's CLAUDE.md (roadmap B9). */
  replyMarker: {
    title: string;
    toggle: string;
    hint: (path: string) => string;
    outdated: string;
  };
  hooksOutdated: string;
  hooksMissing: string;
};

export const zhCN: SettingsAgentText = {
  title: "AI Agent 状态灯",
  install: "安装/修复",
  installing: "安装中",
  installed: "已安装",
  currentStatus: "当前状态",
  clearing: "清除中",
  clearStatus: "清除状态",
  scriptsDir: "脚本目录",
  sessionTitleSection: "小岛显示",
  sessionTitle: "运行时在小岛显示会话标题",
  sessionTitleHint: "显示 Agent 图标和会话标题，结束 3 秒后恢复待办。标题直接读取 Claude Code 和 Codex 的会话记录，不需要安装钩子。",
  sessionPageSection: "会话列表",
  sessionVisibleRows: "展开后显示条数",
  sessionPageHint: "岛屿展开后的 Agent 页一次显示的会话数，更多的会话可以滚动查看。",
  hostDisplay: "会话来源",
  hostDisplayOptions: { both: "图标和名称", icon: "只显示图标", name: "只显示名称", off: "不显示" },
  hostDisplayHint: "会话在哪个程序里运行，比如 Orca、Windows Terminal、VS Code、Codex。正在运行的 Claude Code 会话会自动识别；岛屿启动前就结束的会话没有来源。",
  sessionHours: "列出多久内的会话",
  sessionHoursOption: (hours) => `最近 ${hours} 小时`,
  sessionHoursHint: "最后一次活动在这段时间内的会话才会列出。",
  sessionCardSection: "会话卡片",
  remoteIntro: "在 Agent 页列出其他电脑上的 Claude Code 和 Codex 会话：打开的主机，岛屿每 20 秒用 ssh 读一次它最近的会话记录，服务器上不用安装任何东西。",
  remoteRequirements: "只能用密钥登录，不会弹出密码框，先确认终端里 ssh 能直接登上去。远程会话没有钩子，不会显示「等你处理」，也不能在岛上审批或切到它的窗口。",
  remoteHostsSection: "主机",
  remoteHostsFooter: "~/.ssh/config 里的 Host 和在这里添加的主机都列在上面，最多同时打开 8 台。",
  remoteRefresh: "立即刷新",
  remoteEmpty: "还没有主机",
  remoteEmptyHint: "在下面添加一台，或者在 ~/.ssh/config 里写好 Host 再回到这一页。",
  remoteFromConfig: "来自 ~/.ssh/config",
  remoteFetching: "正在读取…",
  remoteFetchedAt: (time, sessions) => `${time} 读取 · ${sessions} 个会话`,
  remoteFailed: (reason) => `读取失败：${reason}`,
  remoteRemove: (name) => `删除「${name}」`,
  remoteAdd: "添加主机",
  remoteAddHint: "存在岛屿自己的配置里，不会改 ~/.ssh/config。需要跳板机、指定密钥这类设置时，写进 ~/.ssh/config 更合适。",
  remoteName: "名称",
  remoteNamePlaceholder: "不填时用主机地址",
  remoteUser: "用户名",
  remoteUserPlaceholder: "不填时用本机用户名",
  remoteHost: "主机地址",
  remoteHostPlaceholder: "例如 192.168.1.20 或 dev.example.com",
  remotePort: "端口",
  remoteSave: "添加",
  remoteCancel: "取消",
  agentsSection: "显示哪些 Agent",
  showClaudeCode: "显示 Claude Code 会话",
  showCodex: "显示 Codex 会话",
  showAgentsHint: "关掉的 Agent 不出现在 Agent 页，也不算进岛上的运行数量。",
  hideFinished: "只显示进行中的会话",
  hideFinishedHint: "隐藏已完成和失败的会话，只留正在运行、等待确认和可能中断的。",
  hideClosed: "隐藏已退出的会话",
  hideClosedHint: "Claude Code 或 Codex 已经退出的会话不再列出，SessionEnd hook 没触发也算：按进程是否还在判断，远程电脑上的 Claude Code 会话同样适用。",
  showElapsed: "显示运行时长",
  showElapsedHint: "进行中的会话显示\"已运行多久\"，每秒更新；结束的显示这一轮\"用时多久\"。从最近一次提问开始算。",
  showModel: "显示模型和推理强度",
  showActivity: "显示最近提问和正在用的工具",
  showActivityHint: "进行中的会话在回复上方显示你最近一次的提问，运行时显示它正在调用的工具（如 Bash 命令、正在改的文件）。",
  showUsage: "在顶部显示 Claude 用量",
  showUsageHint: "5 小时、7 天和各模型的用量，以及最紧的那个何时重置。读的是 claude-hud 状态栏保存的用量文件（它的 externalUsagePath 或 externalUsageWritePath 设置）；没有时不显示。",
  alerts: {
    title: "弹出提醒",
    hint: "收起的岛屿会自动打开 Agent 页。会话所在窗口已在前台、游戏模式勿扰时，或你正在用展开的岛屿时不弹。",
    started: "会话开始时",
    startedOptions: { everyTurn: "每一轮开始", newSession: "只在新会话开始", off: "不弹" },
    completed: "会话完成时",
    failed: "会话出错时",
    waiting: "等待你确认或回答时",
    seconds: "停留时间",
    secondsValue: (seconds) => `${seconds} 秒`,
    remind: "没处理时再提醒",
    remindDescription: "等你确认或回答的会话过了这么久还在等，再弹一次并再响一次；每次等待只补一次",
    remindValue: (seconds) => (seconds === 0 ? "不再提醒" : seconds < 60 ? `${seconds} 秒后` : `${seconds / 60} 分钟后`),
    quota: "额度提醒",
    quotaDescription: "Claude 或 Codex 的 5 小时、7 天用量到这条线时，在收起的岛屿上提醒一次；额度刷新后再提醒一次",
    quotaValue: (percent) => (percent === 0 ? "不提醒" : `用到 ${percent}%`),
  },
  push: {
    title: "手机推送",
    enabled: "用 Bark 推送到手机",
    enabledHint: "Agent 等你、完成或出错时推到 iPhone 上的 Bark",
    server: "服务器地址",
    serverHint: "留空用 Bark 官方服务器；自建 bark-server 时填它的地址",
    key: "设备 Key",
    keyHint: "在 Bark 里复制推送地址粘贴进来，或只粘贴其中那串字母数字",
    keyIsSaved: "已保存在 Windows 凭据管理器里",
    keyPlaceholder: "https://api.day.app/xxxxxxxx",
    saveKey: "保存",
    clearKey: "清除",
    keySaved: "设备 Key 已保存。",
    keyCleared: "设备 Key 已清除。",
    events: { waiting: "等你确认或回答时", completed: "完成一轮时", failed: "出错时" },
    away: "什么时候推",
    awayHint: "离开电脑一段时间（没有键盘鼠标操作，或已锁屏）才推，坐在电脑前时不打扰手机",
    awayValue: (minutes) => (minutes === 0 ? "总是推送" : `离开 ${minutes} 分钟后`),
    test: "发送测试",
    testAction: "发送",
    testTitle: "FocuSD Island",
    testBody: "Bark 推送已接通",
    testSent: "已发送，看看手机。",
    hint: "推送只包含会话名称和发生了什么，不包含命令、回复或代码。官方服务器由 Bark 运营；在意的话可以自建 bark-server。",
  },
  approval: {
    title: "在岛上审批",
    onIsland: "在岛上允许或拒绝 Agent 的操作",
    whenInFront: "终端在前台时也在岛上弹出",
    whenInFrontHint: "关闭时，会话所在的终端或编辑器窗口在前台，就直接在终端里审批。",
    hint: "Claude Code 或 Codex 要运行命令、改文件时，岛上弹出卡片，可以允许、拒绝或交回终端（快捷键 Ctrl+Alt+Y / N / T）。卡片显示期间终端里不出审批框；2 分钟没处理、游戏模式勿扰时自动交回终端。需要先点下方的“安装/修复”。Codex 还要在它的 /hooks 里信任新钩子。auto 模式自己批准的操作不会弹出。",
  },
  filters: {
    title: "隐藏会话",
    hint: "符合任一条的会话在岛上完全不出现：Agent 页、会话数、收起条标题、提醒和音效都不算它。目录规则也隐藏它的子目录；文字规则匹配会话标题（没有标题时是第一句提示词）或最近一句提示词，不分大小写。",
    kinds: { folder: "所在目录", prompt: "标题或提示词包含" },
    kindLabel: "规则类型",
    add: "添加规则",
    addButton: "添加",
    folderPlaceholder: "例如 E:\\Projects\\scratch",
    promptPlaceholder: "例如 /loop",
    remove: (value) => `删除规则「${value}」`,
  },
  replyMarker: {
    title: "回复状态标记",
    toggle: "让 Claude 在回复末尾标出在等什么（推荐打开）",
    hint: (path) => `打开后，会在你的全局 Claude 指令 ${path} 末尾加一段说明，让 Claude Code 每次回复的最后一行写一个符号：↩ 等你回复、⋯ 在等它自己启动的后台任务、✓ 做完了。岛屿据此区分“等你回复”和“做完了”：Agent 页、会话环，以及提醒和音效（等你回复按“等你确认或回答”弹出、用提问音效；等后台任务时不弹不响）。这一行会出现在终端的回复里。只对之后开始的回复生效；关掉时只删除这段说明，文件里别的内容不动。`,
    outdated: "CLAUDE.md 里的说明是旧版本，关掉再打开即可更新。",
  },
  hooksOutdated: "已安装的钩子是旧版本，“等待确认”状态等新功能不会生效。请点“安装/修复”，然后重启 Codex 和 Claude Code。",
  hooksMissing: "还没有安装钩子。点“安装/修复”后重启 Codex 和 Claude Code，状态灯和会话标题才会工作。",
};

export const en: SettingsAgentText = {
  title: "AI Agent status light",
  install: "Install/repair",
  installing: "Installing",
  installed: "Installed",
  currentStatus: "Status",
  clearing: "Clearing",
  clearStatus: "Clear status",
  scriptsDir: "Scripts folder",
  sessionTitleSection: "On the island",
  sessionTitle: "Show the session title while running",
  sessionTitleHint: "Shows the agent icon and session title, then the todo again 3 seconds after it finishes. Titles are read from the Claude Code and Codex session files, so no hooks are needed.",
  sessionPageSection: "Session list",
  sessionVisibleRows: "Entries shown when open",
  sessionPageHint: "How many sessions the island's Agent page shows at once; scroll for the rest.",
  hostDisplay: "Session source",
  hostDisplayOptions: { both: "Icon and name", icon: "Icon only", name: "Name only", off: "Hidden" },
  hostDisplayHint: "The program a session runs in, such as Orca, Windows Terminal, VS Code or Codex. Running Claude Code sessions are recognized automatically; sessions that ended before the island started have no source.",
  sessionHours: "List sessions from the last",
  sessionHoursOption: (hours) => (hours === 1 ? "1 hour" : `${hours} hours`),
  sessionHoursHint: "Only sessions active within this time are listed.",
  sessionCardSection: "Session cards",
  remoteIntro: "Lists Claude Code and Codex sessions on other computers on the Agent page: for each host that is on, the island reads its recent sessions over ssh every 20 seconds. Nothing is installed on the server.",
  remoteRequirements: "Key login only, with no password prompt: check that ssh logs in by itself in a terminal first. Remote sessions have no hooks, so they never show as waiting on you, cannot be approved on the island, and their windows cannot be brought up.",
  remoteHostsSection: "Hosts",
  remoteHostsFooter: "The Hosts in ~/.ssh/config and the ones added here are listed above; at most 8 can be on.",
  remoteRefresh: "Refresh now",
  remoteEmpty: "No hosts yet",
  remoteEmptyHint: "Add one below, or write a Host in ~/.ssh/config and come back to this page.",
  remoteFromConfig: "From ~/.ssh/config",
  remoteFetching: "Reading…",
  remoteFetchedAt: (time, sessions) => `Read at ${time} · ${sessions === 1 ? "1 session" : `${sessions} sessions`}`,
  remoteFailed: (reason) => `Failed: ${reason}`,
  remoteRemove: (name) => `Remove ${name}`,
  remoteAdd: "Add host",
  remoteAddHint: "Kept in the island's own settings; ~/.ssh/config is not changed. For jump hosts or a particular key, ~/.ssh/config is the better place.",
  remoteName: "Name",
  remoteNamePlaceholder: "The address when left empty",
  remoteUser: "User",
  remoteUserPlaceholder: "Your local user name when left empty",
  remoteHost: "Address",
  remoteHostPlaceholder: "e.g. 192.168.1.20 or dev.example.com",
  remotePort: "Port",
  remoteSave: "Add",
  remoteCancel: "Cancel",
  agentsSection: "Agents shown",
  showClaudeCode: "Show Claude Code sessions",
  showCodex: "Show Codex sessions",
  showAgentsHint: "Agents switched off are left out of the Agent page and the island's running count.",
  hideFinished: "Only sessions in progress",
  hideFinishedHint: "Hide finished and failed sessions; keep running, waiting and possibly stalled ones.",
  hideClosed: "Hide sessions that have quit",
  hideClosedHint: "Sessions whose Claude Code or Codex has quit are no longer listed, even when the SessionEnd hook did not run: told by whether the process still runs, for Claude Code sessions on remote computers too.",
  showElapsed: "Show how long it has run",
  showElapsedHint: "A session in progress shows how long it has been running, updated every second; a finished one shows how long its last turn took. Counted from the latest prompt.",
  showModel: "Show the model and effort",
  showActivity: "Show the latest prompt and the tool in use",
  showActivityHint: "Sessions in progress show your latest prompt above the reply and, while running, the tool they are calling (a Bash command, the file being edited).",
  showUsage: "Show Claude usage at the top",
  showUsageHint: "The 5-hour, 7-day and per-model usage, and when the fullest resets. Read from the usage file the claude-hud status line keeps (its externalUsagePath or externalUsageWritePath setting); hidden without one.",
  alerts: {
    title: "Pop-up alerts",
    hint: "A collapsed island opens the Agent page by itself. Not while the session's window is in front, game mode keeps the island quiet, or you are using the open island.",
    started: "When a session starts",
    startedOptions: { everyTurn: "Every turn", newSession: "New sessions only", off: "Off" },
    completed: "When a session finishes",
    failed: "When a session fails",
    waiting: "When it waits for your approval or answer",
    seconds: "Stays open for",
    secondsValue: (seconds) => `${seconds} s`,
    remind: "Remind again",
    remindDescription: "If a session is still waiting for your approval or answer this long, pop up and sound once more; once per wait",
    remindValue: (seconds) => (seconds === 0 ? "Never" : seconds < 60 ? `after ${seconds} s` : `after ${seconds / 60} min`),
    quota: "Usage alert",
    quotaDescription: "When Claude's or Codex's 5-hour or 7-day usage reaches this level, say so once on the collapsed island, and again when it resets",
    quotaValue: (percent) => (percent === 0 ? "Off" : `at ${percent}%`),
  },
  push: {
    title: "Phone push",
    enabled: "Push to your phone with Bark",
    enabledHint: "When an agent needs you, finishes or fails, push it to Bark on your iPhone",
    server: "Server",
    serverHint: "Leave empty for Bark's own server; for a self-hosted bark-server, enter its address",
    key: "Device key",
    keyHint: "Copy the push URL in Bark and paste it here, or just the letters and digits in it",
    keyIsSaved: "Saved in Windows Credential Manager",
    keyPlaceholder: "https://api.day.app/xxxxxxxx",
    saveKey: "Save",
    clearKey: "Clear",
    keySaved: "Device key saved.",
    keyCleared: "Device key cleared.",
    events: { waiting: "When it waits for you", completed: "When a turn finishes", failed: "When it fails" },
    away: "When to push",
    awayHint: "Only once you have been away (no keyboard or mouse, or locked) for a while, so the phone stays quiet while you sit at the computer",
    awayValue: (minutes) => (minutes === 0 ? "Always" : `After ${minutes} min away`),
    test: "Send a test",
    testAction: "Send",
    testTitle: "FocuSD Island",
    testBody: "Bark push is set up",
    testSent: "Sent; check your phone.",
    hint: "A push only says which session and what happened, never commands, replies or code. Bark's own server is run by Bark; host bark-server yourself if that matters to you.",
  },
  approval: {
    title: "Approve on the island",
    onIsland: "Allow or deny agent actions on the island",
    whenInFront: "Also while the terminal is in front",
    whenInFrontHint: "Off, a request from a session whose terminal or editor window is in front is approved in that terminal.",
    hint: "When Claude Code or Codex wants to run a command or change a file, a card on the island lets you allow, deny or hand it back to the terminal (Ctrl+Alt+Y / N / T). The terminal shows no prompt while the card is up; after 2 minutes, or while game mode keeps the island quiet, it goes back to the terminal. Click Install/repair below first, and trust the new hook in Codex's /hooks. Actions auto mode approves by itself don't show up.",
  },
  filters: {
    title: "Hide sessions",
    hint: "Sessions matching any rule do not show on the island at all: not on the Agent page, in the session count or the collapsed title, nor in alerts and sounds. A folder rule hides its subfolders too; a text rule matches the session's title (its first prompt when it has none) or latest prompt, ignoring case.",
    kinds: { folder: "In folder", prompt: "Title or prompt contains" },
    kindLabel: "Rule type",
    add: "Add a rule",
    addButton: "Add",
    folderPlaceholder: "e.g. E:\\Projects\\scratch",
    promptPlaceholder: "e.g. /loop",
    remove: (value) => `Remove the rule \"${value}\"`,
  },
  replyMarker: {
    title: "Reply status marker",
    toggle: "Have Claude mark what it waits for at the end of each reply (recommended)",
    hint: (path) => `When on, a short instruction goes at the end of your global Claude instructions, ${path}, asking Claude Code to end every reply with one symbol on its own line: ↩ your turn, ⋯ waiting on a background task it started, ✓ done. The island uses it to tell "your turn" from "done": on the Agent page, the session ring, and in alerts and sounds (your turn pops up as waiting for you, with the question sound; waiting on a background task neither pops up nor sounds). The line shows in the terminal's replies. It applies to replies from then on; switching off removes only that instruction and leaves the rest of the file alone.`,
    outdated: "The instruction in CLAUDE.md is an older version; switch off and on again to update it.",
  },
  hooksOutdated: "The installed hooks are from an older version, so newer features such as the waiting-for-you state won't work. Click Install/repair, then restart Codex and Claude Code.",
  hooksMissing: "No hooks installed yet. Click Install/repair, then restart Codex and Claude Code, for the status light and session titles to work.",
};
