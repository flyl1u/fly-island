export type SettingsAgentText = {
  title: string;
  install: string;
  installing: string;
  installed: string;
  currentStatus: string;
  clearStatusFor: (provider: string) => string;
  clearing: string;
  clearStatus: string;
  scriptsDir: string;
  legendTitle: string;
  legend: {
    idle: string;
    running: string;
    attention: string;
  };
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
  showClaudeCode: string;
  showCodex: string;
  showAgentsHint: string;
  hideFinished: string;
  hideFinishedHint: string;
  showElapsed: string;
  showElapsedHint: string;
  showModel: string;
  showActivity: string;
  showActivityHint: string;
  alerts: {
    title: string;
    hint: string;
    completed: string;
    failed: string;
    waiting: string;
    seconds: string;
    secondsValue: (seconds: number) => string;
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
  clearStatusFor: (provider) => `清除 ${provider} 状态`,
  clearing: "清除中",
  clearStatus: "清除状态",
  scriptsDir: "脚本目录",
  legendTitle: "状态灯颜色",
  legend: {
    idle: "绿色：空闲或已完成",
    running: "蓝色：有 Agent 正在运行",
    attention: "黄色：运行失败或可能已中断，可在上方清除状态",
  },
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
  showClaudeCode: "显示 Claude Code 会话",
  showCodex: "显示 Codex 会话",
  showAgentsHint: "关掉的 Agent 不出现在 Agent 页，也不算进岛上的运行数量。",
  hideFinished: "只显示进行中的会话",
  hideFinishedHint: "隐藏已完成和失败的会话，只留正在运行、等待确认和可能中断的。",
  showElapsed: "显示运行时长",
  showElapsedHint: "进行中的会话显示\"已运行多久\"，每秒更新；结束的显示这一轮\"用时多久\"。从最近一次提问开始算。",
  showModel: "显示模型和推理强度",
  showActivity: "显示最近提问和正在用的工具",
  showActivityHint: "进行中的会话在回复上方显示你最近一次的提问，运行时显示它正在调用的工具（如 Bash 命令、正在改的文件）。",
  alerts: {
    title: "弹出提醒",
    hint: "收起的岛屿会自动打开 Agent 页。会话所在窗口已在前台、游戏模式勿扰时，或你正在用展开的岛屿时不弹。",
    completed: "会话完成时",
    failed: "会话出错时",
    waiting: "等待你确认或回答时",
    seconds: "停留时间",
    secondsValue: (seconds) => `${seconds} 秒`,
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
  clearStatusFor: (provider) => `Clear ${provider} status`,
  clearing: "Clearing",
  clearStatus: "Clear status",
  scriptsDir: "Scripts folder",
  legendTitle: "Light colors",
  legend: {
    idle: "Green: idle or finished",
    running: "Blue: an agent is running",
    attention: "Yellow: failed or possibly interrupted; clear it above",
  },
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
  showClaudeCode: "Show Claude Code sessions",
  showCodex: "Show Codex sessions",
  showAgentsHint: "Agents switched off are left out of the Agent page and the island's running count.",
  hideFinished: "Only sessions in progress",
  hideFinishedHint: "Hide finished and failed sessions; keep running, waiting and possibly stalled ones.",
  showElapsed: "Show how long it has run",
  showElapsedHint: "A session in progress shows how long it has been running, updated every second; a finished one shows how long its last turn took. Counted from the latest prompt.",
  showModel: "Show the model and effort",
  showActivity: "Show the latest prompt and the tool in use",
  showActivityHint: "Sessions in progress show your latest prompt above the reply and, while running, the tool they are calling (a Bash command, the file being edited).",
  alerts: {
    title: "Pop-up alerts",
    hint: "A collapsed island opens the Agent page by itself. Not while the session's window is in front, game mode keeps the island quiet, or you are using the open island.",
    completed: "When a session finishes",
    failed: "When a session fails",
    waiting: "When it waits for your approval or answer",
    seconds: "Stays open for",
    secondsValue: (seconds) => `${seconds} s`,
  },
  hooksOutdated: "The installed hooks are from an older version, so newer features such as the waiting-for-you state won't work. Click Install/repair, then restart Codex and Claude Code.",
  hooksMissing: "No hooks installed yet. Click Install/repair, then restart Codex and Claude Code, for the status light and session titles to work.",
};
