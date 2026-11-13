export type AgentText = {
  dshHosts: { official: string; desktop: string; dataelement: string; anywhere: string };
  running: (provider: string) => string;
  failed: (provider: string) => string;
  stale: (provider: string) => string;
  idleOrDone: string;
  phase: {
    running: string;
    completed: string;
    failed: string;
    stale: string;
    waiting: string;
    idle: string;
  };
  sessions: {
    title: string;
    open: string;
    empty: string;
    emptyHint: string;
    focus: (title: string) => string;
    notFound: string;
    notFoundEnded: string;
    justNow: string;
    yourPrompt: (prompt: string) => string;
    minutesAgo: (minutes: number) => string;
    activeCount: (count: number) => string;
    duration: (parts: { hours: number; minutes: number; seconds: number }) => string;
    elapsedRunning: (duration: string) => string;
    elapsedDone: (duration: string) => string;
    /** Badges for the modes in which a session acts without asking; the default mode has none. */
    permissionModes: Record<"auto" | "bypass" | "acceptEdits" | "plan", string>;
    subagents: (count: number) => string;
    /** The agent's own task list (roadmap B6.5.4): steps done of all, and the step running. */
    todos: (done: number, total: number) => string;
    todosCurrent: (step: string) => string;
    backgroundTasks: (count: number) => string;
    /** The context size a card shows at its right end (formatTokens). */
    contextTokens: (size: string) => string;
    remove: (title: string) => string;
    remoteOnly: (host: string) => string;
    /** The Agent page's heading over this computer's sessions, when others are listed too. */
    thisComputer: string;
    /** Heading of sessions without a known folder, when grouped by project. */
    noProject: string;
    /** The Agent page's arrange menu in the island header: the order and the headings. */
    arrange: {
      label: string;
      sort: string;
      group: string;
      sortOptions: { status: string; recent: string; firstSeen: string };
      groupOptions: { computer: string; project: string; none: string };
    };
    removed: string;
    undo: string;
    /** A finished session whose reply ends on the "your turn" marker. */
    yourTurn: string;
    /** A session compacting its context (PreCompact hook); it can take a minute or two. */
    compacting: string;
  };
  /** The usage line at the top of the Agent page. */
  usage: {
    label: string;
    codexLabel: string;
    dshLabel: string;
    dshWallet: (currency: string, total: string, toppedUp: string, granted: string) => string;
    dshWalletTotal: (currency: string, total: string) => string;
    dshWalletParts: (toppedUp: string, granted: string) => string;
    dshAvailable: string;
    dshEmpty: string;
    dshLegend: string[];
    fromDshApi: string;
    fromDshAccount: string;
    workbuddy: { label: string; credits: (value: string) => string; balance: (remaining: string, total: string) => string; percent: (value: number) => string; source: string };
    fiveHour: string;
    sevenDay: string;
    /** Compact time left: "1d10h", "3h20m", "42m". */
    resetsIn: (parts: { days: number; hours: number; minutes: number }) => string;
    /** Read out after the line when the snapshot is old. */
    stale: string;
    updatedAgo: (minutes: number) => string;
    fromHud: string;
    fromMagpie: string;
    fromCodex: string;
    /** "3 分钟前更新 · 来自 claude-hud", on the line's hover card. */
    updated: (ago: string, source: string) => string;
    /** Claude desktop's usage history as the source of the numbers. */
    fromClaudeDesktop: string;
    /** One window on the quota rings' card: "5 小时 剩余 96%（已用 4%）". */
    left: (window: string, left: number, used: number) => string;
    /** Which ring is which, first on the card. */
    ringsLegend: string;
    /** The rings' accessible name: the agent's usage, then each window's summary. */
    rings: (label: string, windows: string[]) => string;
  };
  /** The card for a permission request an agent waits on (roadmap B6 phase 2). */
  approval: {
    label: (tool: string) => string;
    more: (count: number) => string;
    expand: string;
    collapse: string;
    deny: string;
    allow: string;
    allowAlways: string;
    /** The tooltip of "always allow", with the rule it adds for this session. */
    allowAlwaysHint: (rule: string) => string;
    terminal: string;
    terminalHint: string;
  };
  /** The card for a question Claude Code asks with AskUserQuestion (roadmap B6 phase 3). */
  question: {
    label: string;
    other: string;
    submit: string;
  };
  /** The collapsed island's line when a usage limit runs low or resets (roadmap B6.5.2). */
  quota: {
    dshEmpty: string;
    dshRestored: string;
    workbuddyEmpty: string;
    workbuddyRestored: string;
    low: (agent: string, window: string, used: number) => string;
    reset: (agent: string, window: string) => string;
    fiveHour: string;
    sevenDay: string;
  };
  /** The body of a phone push (roadmap B6.5.5); the title is the session's name. */
  push: Record<"waiting" | "completed" | "failed", (agent: string) => string>;
};

export const zhCN: AgentText = {
  dshHosts: { official: "DSH", desktop: "DSH Desktop", dataelement: "DSH Desktop (dataelement)", anywhere: "DSH Desktop (anywhere)" },
  running: (provider) => `${provider} 正在运行`,
  failed: (provider) => `${provider} 运行失败`,
  stale: (provider) => `${provider} 可能已中断`,
  idleOrDone: "AI Agent 空闲或已完成",
  phase: {
    running: "正在运行",
    completed: "已完成",
    failed: "运行失败",
    stale: "可能已中断",
    waiting: "等待确认",
    idle: "空闲",
  },
  sessions: {
    title: "Agent 会话",
    open: "查看 Agent 会话",
    empty: "最近 2 小时没有 Agent 会话",
    emptyHint: "在 Claude Code / Codex / DeepSeek Harness 里开始对话后会显示在这里",
    focus: (title) => `切换到「${title}」所在的窗口`,
    notFound: "没找到对应的窗口",
    notFoundEnded: "没找到对应的窗口，会话可能已经关掉了",
    justNow: "刚刚",
    yourPrompt: (prompt) => `你：${prompt}`,
    minutesAgo: (minutes) => (minutes < 60 ? `${minutes} 分` : `${Math.floor(minutes / 60)} 小时`),
    activeCount: (count) => `${count} 个 Agent 会话正在运行，点击查看`,
    duration: ({ hours, minutes, seconds }) =>
      hours > 0 ? `${hours} 小时 ${minutes} 分` : minutes > 0 ? `${minutes} 分 ${seconds} 秒` : `${seconds} 秒`,
    elapsedRunning: (duration) => `已运行 ${duration}`,
    elapsedDone: (duration) => `用时 ${duration}`,
    permissionModes: { auto: "自动", bypass: "跳过确认", acceptEdits: "自动改文件", plan: "计划" },
    subagents: (count) => `${count} 个子 Agent`,
    todos: (done, total) => `${done}/${total} 步`,
    todosCurrent: (step) => `正在：${step}`,
    backgroundTasks: (count) => `${count} 个后台任务`,
    contextTokens: (size) => `${size} tokens`,
    remove: (title) => `归档「${title}」`,
    remoteOnly: (host) => `没找到连着 ${host} 的终端或编辑器窗口`,
    thisComputer: "本机",
    noProject: "未知项目",
    arrange: {
      label: "排列会话",
      sort: "排序",
      group: "分组",
      sortOptions: { status: "状态优先", recent: "最近活动", firstSeen: "首次出现" },
      groupOptions: { computer: "按电脑", project: "按项目", none: "不分组" },
    },
    removed: "已归档",
    undo: "撤销",
    yourTurn: "等你回复",
    compacting: "正在压缩上下文",
  },
  usage: {
    label: "Claude 用量",
    codexLabel: "Codex 用量",
    dshLabel: "DSH 余额",
    dshWallet: (currency, total, toppedUp, granted) => `${currency} 余额 ${total}（充值 ${toppedUp} · 赠送 ${granted}）`,
    dshWalletTotal: (currency, total) => `${currency} 余额 ${total}`,
    dshWalletParts: (toppedUp, granted) => `充值 ${toppedUp} · 赠送 ${granted}`,
    dshAvailable: "余额可用",
    dshEmpty: "余额不足",
    dshLegend: ["外圈：余额可用", "内圈：有赠送余额", "实心表示可用，不代表百分比。", "余额不是订阅额度，没有重置窗口。"],
    fromDshApi: "DeepSeek API 余额接口",
    fromDshAccount: "DSH 账户余额接口",
    workbuddy: {
      label: "WorkBuddy 积分",
      credits: (value) => `${value} 积分`,
      balance: (remaining, total) => `剩余 ${remaining} / ${total} 积分`,
      percent: (value) => `剩余 ${value}%`,
      source: "WorkBuddy 官网",
    },
    fiveHour: "5 小时",
    sevenDay: "7 天",
    resetsIn: ({ days, hours, minutes }) =>
      days > 0 ? `${days} 天 ${hours} 小时后重置` : hours > 0 ? `${hours} 小时 ${minutes} 分后重置` : `${minutes} 分后重置`,
    stale: "可能已过时",
    updatedAgo: (minutes) => (minutes < 1 ? "刚刚更新" : minutes < 60 ? `${minutes} 分钟前更新` : `${Math.floor(minutes / 60)} 小时前更新`),
    fromHud: "来自 claude-hud",
    fromMagpie: "来自 magpie",
    fromCodex: "来自 Codex 会话记录",
    updated: (ago, source) => `${ago} · ${source}`,
    fromClaudeDesktop: "来自 Claude 桌面版",
    left: (window, left, used) => `${window} 剩余 ${left}%（已用 ${used}%）`,
    ringsLegend: "外圈 5 小时 · 内圈 7 天 · 显示剩余额度",
    rings: (label, windows) => [label, ...windows].join("；"),
  },
  approval: {
    label: (tool) => `请求使用 ${tool}`,
    more: (count) => `还有 ${count} 个`,
    expand: "展开完整内容",
    collapse: "收起",
    deny: "拒绝",
    allow: "允许",
    allowAlways: "始终允许",
    allowAlwaysHint: (rule) => `本次会话内不再询问：${rule}`,
    terminal: "到终端",
    terminalHint: "交回终端处理，并切换到它的窗口",
  },
  question: {
    label: "在问你",
    other: "其他回答…",
    submit: "提交",
  },
  quota: {
    dshEmpty: "DSH 余额不足",
    dshRestored: "DSH 余额已恢复可用",
    workbuddyEmpty: "WorkBuddy 积分已用完",
    workbuddyRestored: "WorkBuddy 积分已恢复",
    low: (agent, window, used) => `${agent} ${window}额度已用 ${used}%`,
    reset: (agent, window) => `${agent} ${window}额度已刷新`,
    fiveHour: "5 小时",
    sevenDay: "7 天",
  },
  push: {
    waiting: (agent) => `${agent} 在等你确认或回答`,
    completed: (agent) => `${agent} 完成了这一轮`,
    failed: (agent) => `${agent} 出错了`,
  },
};

export const en: AgentText = {
  dshHosts: { official: "DSH", desktop: "DSH Desktop", dataelement: "DSH Desktop (dataelement)", anywhere: "DSH Desktop (anywhere)" },
  running: (provider) => `${provider} is running`,
  failed: (provider) => `${provider} failed`,
  stale: (provider) => `${provider} may have stalled`,
  idleOrDone: "AI Agent idle or finished",
  phase: {
    running: "Running",
    completed: "Done",
    failed: "Failed",
    stale: "Stalled",
    waiting: "Waiting for you",
    idle: "Idle",
  },
  sessions: {
    title: "Agent sessions",
    open: "Show agent sessions",
    empty: "No agent sessions in the last 2 hours",
    emptyHint: "Conversations in Claude Code, Codex or DeepSeek Harness show up here",
    focus: (title) => `Switch to the window running "${title}"`,
    notFound: "No matching window found",
    notFoundEnded: "No matching window; the session may have been closed",
    justNow: "<1m",
    yourPrompt: (prompt) => `You: ${prompt}`,
    minutesAgo: (minutes) => (minutes < 60 ? `${minutes}m` : `${Math.floor(minutes / 60)}h`),
    activeCount: (count) => (count === 1 ? "1 agent session running; click to view" : `${count} agent sessions running; click to view`),
    duration: ({ hours, minutes, seconds }) =>
      hours > 0 ? `${hours}h ${minutes}m` : minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`,
    elapsedRunning: (duration) => `running ${duration}`,
    elapsedDone: (duration) => `took ${duration}`,
    permissionModes: { auto: "Auto", bypass: "Bypass", acceptEdits: "Accept edits", plan: "Plan" },
    subagents: (count) => (count === 1 ? "1 subagent" : `${count} subagents`),
    todos: (done, total) => `${done}/${total} steps`,
    todosCurrent: (step) => `Now: ${step}`,
    backgroundTasks: (count) => (count === 1 ? "1 background task" : `${count} background tasks`),
    contextTokens: (size) => `${size} tokens`,
    remove: (title) => `Archive "${title}"`,
    remoteOnly: (host) => `No terminal or editor window connected to ${host}`,
    thisComputer: "This computer",
    noProject: "No project",
    arrange: {
      label: "Arrange sessions",
      sort: "Sort",
      group: "Group",
      sortOptions: { status: "Status", recent: "Recent", firstSeen: "First seen" },
      groupOptions: { computer: "Computer", project: "Project", none: "None" },
    },
    removed: "Archived",
    undo: "Undo",
    yourTurn: "Your turn",
    compacting: "Compacting context",
  },
  usage: {
    label: "Claude usage",
    codexLabel: "Codex usage",
    dshLabel: "DSH balance",
    dshWallet: (currency, total, toppedUp, granted) => `${currency} balance ${total} (topped up ${toppedUp} · bonus ${granted})`,
    dshWalletTotal: (currency, total) => `${currency} balance ${total}`,
    dshWalletParts: (toppedUp, granted) => `Topped up ${toppedUp} · Bonus ${granted}`,
    dshAvailable: "Balance available",
    dshEmpty: "Insufficient balance",
    dshLegend: ["Outer: usable balance", "Inner: bonus present", "Filled = available; no percentage.", "Prepaid, no subscription window."],
    fromDshApi: "DeepSeek API balance endpoint",
    fromDshAccount: "DSH account balance endpoint",
    workbuddy: {
      label: "WorkBuddy credits",
      credits: (value) => `${value} credits`,
      balance: (remaining, total) => `${remaining} of ${total} credits left`,
      percent: (value) => `${value}% left`,
      source: "WorkBuddy website",
    },
    fiveHour: "5h",
    sevenDay: "7d",
    resetsIn: ({ days, hours, minutes }) => (days > 0 ? `resets in ${days}d${hours}h` : hours > 0 ? `resets in ${hours}h${minutes}m` : `resets in ${minutes}m`),
    stale: "may be stale",
    updatedAgo: (minutes) => (minutes < 1 ? "updated just now" : minutes < 60 ? `updated ${minutes} min ago` : `updated ${Math.floor(minutes / 60)} h ago`),
    fromHud: "via claude-hud",
    fromMagpie: "from magpie",
    fromCodex: "from Codex's session logs",
    updated: (ago, source) => `${ago} · ${source}`,
    fromClaudeDesktop: "from the Claude desktop app",
    left: (window, left, used) => `${window} ${left}% left (${used}% used)`,
    ringsLegend: "Outer ring 5h · inner ring 7d · showing what is left",
    rings: (label, windows) => [label, ...windows].join("; "),
  },
  approval: {
    label: (tool) => `Wants to use ${tool}`,
    more: (count) => `${count} more`,
    expand: "Show all of it",
    collapse: "Show less",
    deny: "Deny",
    allow: "Allow",
    allowAlways: "Always",
    allowAlwaysHint: (rule) => `Don't ask again this session: ${rule}`,
    terminal: "Terminal",
    terminalHint: "Hand it back to the terminal and switch to its window",
  },
  question: {
    label: "Asks you",
    other: "Something else…",
    submit: "Submit",
  },
  quota: {
    dshEmpty: "DSH balance exhausted",
    dshRestored: "DSH balance available again",
    workbuddyEmpty: "WorkBuddy credits used up",
    workbuddyRestored: "WorkBuddy credits available again",
    low: (agent, window, used) => `${agent} ${window} usage at ${used}%`,
    reset: (agent, window) => `${agent} ${window} usage reset`,
    fiveHour: "5-hour",
    sevenDay: "7-day",
  },
  push: {
    waiting: (agent) => `${agent} is waiting for your approval or answer`,
    completed: (agent) => `${agent} finished its turn`,
    failed: (agent) => `${agent} failed`,
  },
};
