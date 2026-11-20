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
  sources: {
    title: string; claudeCode: string; claudeCodeHint: string; codex: string; codexHint: string; dsh: string; dshHint: string; workbuddy: string; workbuddyHint: string;
    /** Agents installed from the plugin market; their rows appear only once installed. */
    native: Record<"cursor" | "kimiCode" | "hermes" | "zcode", string>;
  };
  quotaRings: { title: string; hint: string; sources: Record<AgentQuotaSource, string> };
  zcodeApiKey: {
    title: string; description: string; platform: string; platformOptions: { bigmodel: string; zai: string };
    apiKey: string; apiKeyHint: string; placeholder: string; save: string; check: string; clear: string; show: string; hide: string;
    status: {
      checking: string; saved: string; noQuota: string; invalidKey: string; network: string; http: (status: string) => string;
      response: string; storage: string; required: string; invalidInput: string; cleared: string; desktopReady: string;
      platformSaved: string; desktopError: string;
    };
  };
  workbuddy: {
    signedOut: string; loginRequired: string; ready: string; connected: string; unavailable: string;
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
    native: {
      cursor: "只读取 Cursor 本机的 Agent 对话。点击会话可切到对应的 Cursor 窗口。",
      kimiCode: "读取 Kimi Code CLI 的会话记录，并在 Agent 页显示套餐额度环。",
      hermes: "只读取 Hermes Agent 的会话记录。",
      zcode: "用 Z Code 客户端登录或 Coding Plan API Key，在 Agent 页显示套餐额度环。",
    } },
  quotaRings: { title: "额度环", hint: "勾选要在 Agent 页显示的额度来源。", sources: { claudeCode: "Claude", codex: "Codex", dsh: "DSH", workbuddy: "WorkBuddy", kimiCode: "Kimi Code", zcode: "Z Code" } },
  zcodeApiKey: {
    title: "Coding Plan API Key",
    description: "填写后优先使用 Key 查询额度；留空时使用 Z Code 桌面版登录。",
    platform: "平台",
    platformOptions: { bigmodel: "智谱国内 (open.bigmodel.cn)", zai: "Z.ai 国际 (api.z.ai)" },
    apiKey: "API Key",
    apiKeyHint: "从 bigmodel.cn 控制台「API Keys」获取，或复制配置 Claude Code 时的 ANTHROPIC_AUTH_TOKEN。",
    placeholder: "粘贴 Coding Plan API Key",
    save: "保存并检查",
    check: "重新检查",
    clear: "清除",
    show: "显示 API Key",
    hide: "隐藏 API Key",
    status: {
      checking: "正在检查额度…",
      saved: "Key 已保存，额度读取成功。",
      noQuota: "请求成功，但没有识别到 Coding Plan 额度；请检查平台和 Key。",
      invalidKey: "API Key 无效或平台不匹配，请核对平台和 Key。",
      network: "无法连接额度服务，请检查网络或代理。",
      http: (status) => `额度服务返回 HTTP ${status}，请检查平台或稍后重试。`,
      response: "额度服务返回的数据无法读取。",
      storage: "无法访问 Windows 凭据管理器。",
      required: "请输入 API Key。",
      invalidInput: "API Key 需为可打印字符，且不超过 2048 个字符。",
      cleared: "Key 已清除；之后会尝试使用 Z Code 桌面版登录。",
      desktopReady: "Key 已清除，当前使用 Z Code 桌面版登录读取额度。",
      platformSaved: "平台已保存。",
      desktopError: "Z Code 桌面版登录暂不可用，请重新登录或填写 API Key。",
    },
  },
  workbuddy: {
    signedOut: "未登录 WorkBuddy",
    loginRequired: "WorkBuddy 登录已过期",
    ready: "已登录 WorkBuddy",
    connected: "已登录 WorkBuddy",
    unavailable: "暂时读不到 WorkBuddy 积分",
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
    native: {
      cursor: "Reads Cursor's local agent chats, read-only. Select a session to bring its Cursor window forward.",
      kimiCode: "Reads Kimi Code CLI sessions and shows its plan's quota rings on the Agent page.",
      hermes: "Reads Hermes Agent sessions, read-only.",
      zcode: "Shows Z Code's plan quota rings on the Agent page using its desktop sign-in or a Coding Plan API key.",
    } },
  quotaRings: { title: "Quota rings", hint: "Choose the quota sources to display on the Agent page.", sources: { claudeCode: "Claude", codex: "Codex", dsh: "DSH", workbuddy: "WorkBuddy", kimiCode: "Kimi Code", zcode: "Z Code" } },
  zcodeApiKey: {
    title: "Coding Plan API key",
    description: "A saved key takes priority for quota checks. Leave it empty to use the Z Code desktop sign-in.",
    platform: "Platform",
    platformOptions: { bigmodel: "China (open.bigmodel.cn)", zai: "International (api.z.ai)" },
    apiKey: "API key",
    apiKeyHint: "Get a key from API Keys in the bigmodel.cn console, or copy ANTHROPIC_AUTH_TOKEN from your Claude Code configuration.",
    placeholder: "Paste a Coding Plan API key",
    save: "Save and check",
    check: "Check again",
    clear: "Clear",
    show: "Show API key",
    hide: "Hide API key",
    status: {
      checking: "Checking quota…",
      saved: "Key saved. Quota loaded.",
      noQuota: "The request succeeded but no Coding Plan quota was found. Check the platform and key.",
      invalidKey: "The API key is invalid or the platform does not match. Check both values.",
      network: "Couldn't reach the quota service. Check your network or proxy.",
      http: (status) => `The quota service returned HTTP ${status}. Check the platform or try again later.`,
      response: "The quota service returned data that couldn't be read.",
      storage: "Couldn't access Windows Credential Manager.",
      required: "Enter an API key.",
      invalidInput: "The API key must use printable characters and be no longer than 2048 characters.",
      cleared: "Key cleared. The Z Code desktop sign-in will be tried when available.",
      desktopReady: "Key cleared. Quota is using the Z Code desktop sign-in.",
      platformSaved: "Platform saved.",
      desktopError: "The Z Code desktop sign-in is unavailable. Sign in again or enter an API key.",
    },
  },
  workbuddy: {
    signedOut: "Not signed in to WorkBuddy",
    loginRequired: "WorkBuddy sign-in expired",
    ready: "Signed in to WorkBuddy",
    connected: "Signed in to WorkBuddy",
    unavailable: "WorkBuddy credits unavailable",
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
