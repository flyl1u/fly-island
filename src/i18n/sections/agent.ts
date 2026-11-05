export type AgentText = {
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
    justNow: string;
    minutesAgo: (minutes: number) => string;
    activeCount: (count: number) => string;
  };
};

export const zhCN: AgentText = {
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
    emptyHint: "在 Claude Code 或 Codex 里开始对话后会显示在这里",
    focus: (title) => `切换到「${title}」所在的窗口`,
    notFound: "没找到对应的窗口",
    justNow: "刚刚",
    minutesAgo: (minutes) => (minutes < 60 ? `${minutes} 分钟前` : `${Math.floor(minutes / 60)} 小时前`),
    activeCount: (count) => `${count} 个 Agent 会话正在运行，点击查看`,
  },
};

export const en: AgentText = {
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
    emptyHint: "Conversations in Claude Code or Codex show up here",
    focus: (title) => `Switch to the window running "${title}"`,
    notFound: "No matching window found",
    justNow: "Just now",
    minutesAgo: (minutes) => (minutes < 60 ? `${minutes} min ago` : `${Math.floor(minutes / 60)} h ago`),
    activeCount: (count) => (count === 1 ? "1 agent session running; click to view" : `${count} agent sessions running; click to view`),
  },
};
