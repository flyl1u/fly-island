import type { AgentQuotaSource } from "../../../features/appearance/types";

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
  /** The Agent page's list: its order and its headings. */
  sessionList: {
    title: string;
    sort: string;
    group: string;
    sortOptions: { status: string; recent: string; firstSeen: string };
    groupOptions: { computer: string; project: string; none: string };
  };
  sources: {
    title: string; claudeCode: string; claudeCodeHint: string; codex: string; codexHint: string; dsh: string; dshHint: string; workbuddy: string; workbuddyHint: string;
    /** Agents installed from the plugin market; their rows appear only once installed. */
    /** The switch in an installed Agent plugin's own group. */
    showOnIsland: string;
    native: Record<"cursor" | "kimiCode" | "codebuddy" | "antigravity" | "hermes" | "zcode" | "relay", string>;
  };
  quotaRings: { title: string; hint: string; sources: Record<AgentQuotaSource, string> };
  zcodeApiKey: {
    title: string; empty: string; saved: (maskedKey: string, platform: string) => string; settings: string;
    platform: string; platformOptions: { bigmodel: string; zai: string }; platformNames: { bigmodel: string; zai: string };
    apiKey: string; apiKeyHint: string; placeholder: string; savedPlaceholder: (maskedKey: string) => string;
    save: string; clear: string; cancel: string; show: string; hide: string;
    status: {
      loading: string; checking: string; noQuota: string; invalidKey: string; network: string; http: (status: string) => string;
      response: string; storage: string; invalidInput: string; desktopError: string;
    };
  };
  relayAccounts: {
    title: string; empty: string; count: (count: number) => string; settings: string;
    add: string; edit: string; delete: string; confirmDelete: string; cancel: string; save: string;
    name: string; adapter: string; adapterOptions: Record<"newapi-account" | "newapi-token" | "sub2api" | "custom", string>;
    baseUrl: string; accessToken: string; refreshToken: string; apiKey: string; userId: string;
    endpointPath: string; authMode: string; authModes: { bearer: string; xApiKey: string };
    currency: string; divisor: string; remainingPath: string; usedPath: string; totalPath: string; secretHint: string;
    status: Record<"checking" | "saved" | "unknown" | "credential" | "auth" | "unauthorized" | "network" | "response" | "http" | "storage"
      | "adapter" | "name" | "url" | "path" | "jsonPath" | "authMode" | "currency" | "divisor" | "format" | "changed", string>;
  };
  workbuddy: {
    signedOut: string; loginRequired: string; ready: string; connected: string; unavailable: string; curlUnavailable: string;
    signIn: string; retry: string; signOut: string; busy: string; actionFailed: string;
  };
  alerts: {
    title: string;
    hint: string;
    completed: string;
    waiting: string;
    /** Claude's or Codex's usage reaching a level (roadmap B6.5.2). */
    quota: string;
  };
  /** Approving agents' permission requests on the island (roadmap B6 phase 2). */
  approval: {
    title: string;
    onIsland: string;
    hint: string;
  };
  /** The optional reply status marker in the user's CLAUDE.md (roadmap B9). */
  replyMarker: {
    title: string;
    toggle: string;
    hint: (path: string) => string;
    outdated: string;
    preview: string;
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
  sessionTitleHint: "显示 Agent 图标和会话标题，结束 3 秒后恢复待办。标题直接读取 Claude Code、Codex、DSH、WorkBuddy 和插件市场里装上的 Agent 的本地会话记录，不需要安装钩子。",
  sessionList: {
    title: "会话列表",
    sort: "排序",
    group: "分组",
    sortOptions: { status: "状态优先", recent: "最近活动", firstSeen: "首次出现" },
    groupOptions: { computer: "按电脑", project: "按项目", none: "不分组" },
  },
  sources: {
    title: "会话来源",
    claudeCode: "Claude Code",
    claudeCodeHint: "关闭后隐藏 Claude Code 的会话、标题和提醒。",
    codex: "Codex",
    codexHint: "关闭后隐藏 Codex 的会话、标题和提醒。",
    dsh: "DeepSeek Harness（DSH）",
    dshHint: "读取桌面端的会话记录。点击会话可打开 DSH 主窗口。",
    workbuddy: "WorkBuddy",
    workbuddyHint: "读取桌面端的会话记录。点击会话可打开 WorkBuddy。",
    showOnIsland: "在岛上显示",
    native: {
      cursor: "只读取 Cursor 本机的 Agent 对话。点击会话可切到对应的 Cursor 窗口。",
      kimiCode: "读取 Kimi Code CLI 的会话记录，并在 Agent 页显示套餐额度环。",
      codebuddy: "读取 CodeBuddy CLI 的会话记录。点击会话可切到运行它的终端窗口。",
      antigravity: "读取 Antigravity 的会话和回复摘要，并按模型显示额度环。点击会话可切到 Antigravity。",
      hermes: "只读取 Hermes Agent 的会话记录。",
      zcode: "用 Z Code 客户端登录或 Coding Plan API Key，在 Agent 页显示套餐额度环。",
      relay: "从你填写的第三方中转站账号读取额度，每个账号在 Agent 页显示一个金额环。",
    } },
  quotaRings: { title: "额度环", hint: "勾选要在 Agent 页显示的额度来源。", sources: { claudeCode: "Claude", codex: "Codex", dsh: "DSH", workbuddy: "WorkBuddy", kimiCode: "Kimi Code", zcode: "Z Code", antigravity: "Antigravity", relay: "第三方中转站" } },
  zcodeApiKey: {
    title: "Coding Plan API Key（可选）",
    empty: "未填写，使用 Z Code 桌面版登录",
    saved: (maskedKey, platform) => `已保存 ${maskedKey} · ${platform}`,
    settings: "设置",
    platform: "平台",
    platformOptions: { bigmodel: "智谱国内 (open.bigmodel.cn)", zai: "Z.ai 国际 (api.z.ai)" },
    platformNames: { bigmodel: "智谱国内", zai: "Z.ai 国际" },
    apiKey: "API Key",
    apiKeyHint: "从 bigmodel.cn 控制台「API Keys」获取，或复制配置 Claude Code 时的 ANTHROPIC_AUTH_TOKEN。",
    placeholder: "粘贴 Coding Plan API Key",
    savedPlaceholder: (maskedKey) => `已保存 ${maskedKey}，留空则不修改`,
    save: "保存并检查",
    clear: "清除 Key",
    cancel: "取消",
    show: "显示 API Key",
    hide: "隐藏 API Key",
    status: {
      loading: "正在读取设置…",
      checking: "正在检查额度…",
      noQuota: "未查到 Coding Plan 额度。",
      invalidKey: "API Key 无效或平台不匹配。",
      network: "无法连接额度服务。",
      http: (status) => `额度服务返回 HTTP ${status}。`,
      response: "无法读取额度数据。",
      storage: "无法访问 Windows 凭据管理器。",
      invalidInput: "API Key 需为可打印字符，且不超过 2048 个字符。",
      desktopError: "Z Code 桌面版登录暂不可用。",
    },
  },
  relayAccounts: {
    title: "第三方中转站",
    empty: "还没有配置中转站账号",
    count: (count) => `已配置 ${count} 个账号`,
    settings: "管理",
    add: "添加账号",
    edit: "编辑",
    delete: "删除",
    confirmDelete: "确认删除？",
    cancel: "取消",
    save: "保存并检查",
    name: "名称",
    adapter: "适配器",
    adapterOptions: { "newapi-account": "New API 账户", "newapi-token": "New API 令牌", sub2api: "Sub2API", custom: "自定义接口" },
    baseUrl: "接口地址（Base URL）",
    accessToken: "Access Token",
    refreshToken: "Refresh Token",
    apiKey: "API Key",
    userId: "用户 ID（可选）",
    endpointPath: "余额路径",
    authMode: "鉴权方式",
    authModes: { bearer: "Bearer", xApiKey: "x-api-key" },
    currency: "货币代码",
    divisor: "额度换算单位",
    remainingPath: "剩余额度 JSON 路径",
    usedPath: "已用额度 JSON 路径（可选）",
    totalPath: "总额度 JSON 路径（可选）",
    secretHint: "留空表示保留已有凭据",
    status: {
      checking: "正在检查余额…", saved: "已保存并检查通过", unknown: "保存失败，请重试",
      changed: "账号已在其他操作中更新，请重新打开后保存。",
      credential: "缺少凭据，请填写 Key 或令牌", auth: "凭据被拒绝，请检查 Key 或令牌", unauthorized: "凭据已过期，请更新令牌",
      network: "无法连接中转站", response: "返回数据无法读取", http: "中转站返回错误",
      storage: "无法访问 Windows 凭据管理器", adapter: "适配器无效", name: "名称不能为空", url: "接口地址格式不正确",
      path: "余额路径格式不正确", jsonPath: "JSON 路径格式不正确", authMode: "鉴权方式无效", currency: "货币代码无效",
      divisor: "换算单位必须大于 0", format: "余额格式无法识别",
    },
  },
  workbuddy: {
    signedOut: "未登录 WorkBuddy",
    loginRequired: "WorkBuddy 登录已过期",
    ready: "已登录 WorkBuddy",
    connected: "已登录 WorkBuddy",
    unavailable: "暂时读不到 WorkBuddy 积分",
    curlUnavailable: "缺少 Windows 自带的 curl.exe，暂时无法读取积分；本地会话仍可用。",
    signIn: "去登录",
    retry: "重试",
    signOut: "退出登录",
    busy: "处理中…",
    actionFailed: "操作未完成，请重试。",
  },
  alerts: {
    title: "弹出提醒",
    hint: "收起的岛屿会自动打开 Agent 页。会话所在窗口已在前台、游戏模式勿扰时，或你正在用展开的岛屿时不弹。",
    completed: "会话完成时",
    waiting: "等待你确认或回答时",
    quota: "额度提醒",
  },
  approval: {
    title: "在岛上审批",
    onIsland: "在岛上允许或拒绝 Agent 的操作",
    hint: "Claude Code 或 Codex 要运行命令、改文件时，岛上弹出卡片，可以允许、拒绝或交回终端（快捷键 Ctrl+Alt+Y / N / T）。卡片显示期间终端里不出审批框；2 分钟没处理、游戏模式勿扰时自动交回终端。需要先点下方的“安装/修复”。Codex 还要在它的 /hooks 里信任新钩子。auto 模式自己批准的操作不会弹出。",
  },
  replyMarker: {
    title: "回复状态标记",
    toggle: "让 Claude 在回复末尾标出在等什么（推荐打开）",
    hint: (path) => `打开后，会新建 Claude Code 的用户级规则文件 ${path}（每个会话都会读它，不改你的 CLAUDE.md），让 Claude Code 每次回复的最后一行写一个符号：↩ 等你回复、⋯ 在等它自己启动的后台任务、✓ 做完了。岛屿据此区分“等你回复”和“做完了”：Agent 页、会话环，以及提醒和音效（等你回复按“等你确认或回答”弹出、用提问音效；等后台任务时不弹不响）。这一行会出现在终端的回复里。SSH 远程页里打开的电脑也会写同一个文件。只对之后开始的会话生效；关掉时删除这个文件。`,
    outdated: "说明是旧版本，或者还在旧位置 CLAUDE.md 里；关掉再打开即可更新并移到规则文件。",
    preview: "查看将写入的内容",
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
  sessionTitleHint: "Shows the agent icon and session title, then the todo again 3 seconds after it finishes. Titles are read from the local session records of Claude Code, Codex, DSH, WorkBuddy and the agents installed from the plugin market, so no hooks are needed.",
  sessionList: {
    title: "Session list",
    sort: "Sort",
    group: "Group",
    sortOptions: { status: "Status", recent: "Recent", firstSeen: "First seen" },
    groupOptions: { computer: "Computer", project: "Project", none: "None" },
  },
  sources: {
    title: "Session sources",
    claudeCode: "Claude Code",
    claudeCodeHint: "Switching off hides Claude Code sessions, titles and alerts.",
    codex: "Codex",
    codexHint: "Switching off hides Codex sessions, titles and alerts.",
    dsh: "DeepSeek Harness (DSH)",
    dshHint: "Reads local desktop sessions. Select a session to open the DSH window.",
    workbuddy: "WorkBuddy",
    workbuddyHint: "Reads local desktop sessions. Select a session to open WorkBuddy.",
    showOnIsland: "Show on the island",
    native: {
      cursor: "Reads Cursor's local agent chats, read-only. Select a session to bring its Cursor window forward.",
      kimiCode: "Reads Kimi Code CLI sessions and shows its plan's quota rings on the Agent page.",
      codebuddy: "Reads CodeBuddy CLI sessions, read-only. Select a session to bring its terminal window forward.",
      antigravity: "Reads Antigravity sessions and reply previews and shows quota rings by model, read-only. Select a session to bring Antigravity forward.",
      hermes: "Reads Hermes Agent sessions, read-only.",
      zcode: "Shows Z Code's plan quota rings on the Agent page using its desktop sign-in or a Coding Plan API key.",
      relay: "Reads quotas from your configured third-party relays, one balance ring per account on the Agent page.",
    } },
  quotaRings: { title: "Quota rings", hint: "Choose the quota sources to display on the Agent page.", sources: { claudeCode: "Claude", codex: "Codex", dsh: "DSH", workbuddy: "WorkBuddy", kimiCode: "Kimi Code", zcode: "Z Code", antigravity: "Antigravity", relay: "Third-party relays" } },
  zcodeApiKey: {
    title: "Coding Plan API Key (optional)",
    empty: "No key set. Using Z Code desktop sign-in.",
    saved: (maskedKey, platform) => `Saved ${maskedKey} · ${platform}`,
    settings: "Settings",
    platform: "Platform",
    platformOptions: { bigmodel: "China (open.bigmodel.cn)", zai: "International (api.z.ai)" },
    platformNames: { bigmodel: "China", zai: "Z.ai" },
    apiKey: "API Key",
    apiKeyHint: "Get a key from API Keys in the bigmodel.cn console, or copy ANTHROPIC_AUTH_TOKEN from your Claude Code configuration.",
    placeholder: "Paste a Coding Plan API Key",
    savedPlaceholder: (maskedKey) => `Saved ${maskedKey}. Leave blank to keep it.`,
    save: "Save and check",
    clear: "Clear Key",
    cancel: "Cancel",
    show: "Show API Key",
    hide: "Hide API Key",
    status: {
      loading: "Loading settings…",
      checking: "Checking quota…",
      noQuota: "No Coding Plan quota found.",
      invalidKey: "Invalid API Key or platform mismatch.",
      network: "Couldn't reach the quota service.",
      http: (status) => `The quota service returned HTTP ${status}.`,
      response: "Couldn't read the quota data.",
      storage: "Couldn't access Windows Credential Manager.",
      invalidInput: "Use up to 2048 printable characters for the API Key.",
      desktopError: "Z Code desktop sign-in is unavailable.",
    },
  },
  relayAccounts: {
    title: "Third-party relays",
    empty: "No relay account configured yet",
    count: (count) => `${count} account${count === 1 ? "" : "s"} configured`,
    settings: "Manage",
    add: "Add account",
    edit: "Edit",
    delete: "Delete",
    confirmDelete: "Delete?",
    cancel: "Cancel",
    save: "Save and check",
    name: "Name",
    adapter: "Adapter",
    adapterOptions: { "newapi-account": "New API account", "newapi-token": "New API token", sub2api: "Sub2API", custom: "Custom endpoint" },
    baseUrl: "Base URL",
    accessToken: "Access Token",
    refreshToken: "Refresh Token",
    apiKey: "API Key",
    userId: "User ID (optional)",
    endpointPath: "Balance path",
    authMode: "Authentication",
    authModes: { bearer: "Bearer", xApiKey: "x-api-key" },
    currency: "Currency code",
    divisor: "Quota unit",
    remainingPath: "Remaining JSON path",
    usedPath: "Used JSON path (optional)",
    totalPath: "Total JSON path (optional)",
    secretHint: "Leave blank to keep the saved credential",
    status: {
      checking: "Checking balance…", saved: "Saved and verified", unknown: "Could not save; try again",
      changed: "This account changed during the check. Reopen it before saving.",
      credential: "Missing credential; add a key or token", auth: "Credential rejected; check the key or token", unauthorized: "Credential expired; update the token",
      network: "Cannot reach the relay", response: "Cannot read the response", http: "The relay returned an error",
      storage: "Cannot access Windows Credential Manager", adapter: "Invalid adapter", name: "Name is required", url: "Invalid base URL",
      path: "Invalid balance path", jsonPath: "Invalid JSON path", authMode: "Invalid authentication", currency: "Invalid currency",
      divisor: "Quota unit must be greater than 0", format: "Unrecognized balance format",
    },
  },
  workbuddy: {
    signedOut: "Not signed in to WorkBuddy",
    loginRequired: "WorkBuddy sign-in expired",
    ready: "Signed in to WorkBuddy",
    connected: "Signed in to WorkBuddy",
    unavailable: "WorkBuddy credits unavailable",
    curlUnavailable: "Windows curl.exe is missing. Credits are unavailable; local sessions still work.",
    signIn: "Sign in",
    retry: "Retry",
    signOut: "Sign out",
    busy: "Working…",
    actionFailed: "Couldn't finish the action. Try again.",
  },
  alerts: {
    title: "Pop-up alerts",
    hint: "A collapsed island opens the Agent page by itself. Not while the session's window is in front, game mode keeps the island quiet, or you are using the open island.",
    completed: "When a session finishes",
    waiting: "When it waits for your approval or answer",
    quota: "Usage alert",
  },
  approval: {
    title: "Approve on the island",
    onIsland: "Allow or deny agent actions on the island",
    hint: "When Claude Code or Codex wants to run a command or change a file, a card on the island lets you allow, deny or hand it back to the terminal (Ctrl+Alt+Y / N / T). The terminal shows no prompt while the card is up; after 2 minutes, or while game mode keeps the island quiet, it goes back to the terminal. Click Install/repair below first, and trust the new hook in Codex's /hooks. Actions auto mode approves by itself don't show up.",
  },
  replyMarker: {
    title: "Reply status marker",
    toggle: "Have Claude mark what it waits for at the end of each reply (recommended)",
    hint: (path) => `When on, the island creates a Claude Code user rule, ${path}, which every session reads (your CLAUDE.md stays untouched), asking Claude Code to end every reply with one symbol on its own line: ↩ your turn, ⋯ waiting on a background task it started, ✓ done. The island uses it to tell "your turn" from "done": on the Agent page, the session ring, and in alerts and sounds (your turn pops up as waiting for you, with the question sound; waiting on a background task neither pops up nor sounds). The line shows in the terminal's replies. Computers switched on under SSH remote get the same file. It applies to sessions started from then on; switching off deletes the file.`,
    outdated: "The instruction is an older version, or still in CLAUDE.md where older versions put it; switch off and on again to update it and move it to the rules file.",
    preview: "See what will be written",
  },
  hooksOutdated: "The installed hooks are from an older version, so newer features such as the waiting-for-you state won't work. Click Install/repair, then restart Codex and Claude Code.",
  hooksMissing: "No hooks installed yet. Click Install/repair, then restart Codex and Claude Code, for the status light and session titles to work.",
};
