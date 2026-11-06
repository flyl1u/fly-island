export type ResetParts = { days: number; hours: number; minutes: number };

export type ClaudeUsageText = {
  fiveHour: string;
  sevenDay: string;
  /** "5 小时 42% · 2 小时 13 分后重置"; `reset` is null when the snapshot gave no reset time. */
  window: (label: string, percent: number, reset: string | null) => string;
  resetsIn: (parts: ResetParts) => string;
  resettingSoon: string;
  updatedAgo: (minutes: number) => string;
  /** "3 分钟前更新 · 来自 claude-hud". */
  updated: (ago: string) => string;
  /** The ring button's label: what the card says, and that a click re-reads it. */
  ringLabel: (details: string) => string;
  noData: string;
};

export const zhCN: ClaudeUsageText = {
  fiveHour: "5 小时",
  sevenDay: "7 天",
  window: (label, percent, reset) => (reset ? `${label} ${percent}% · ${reset}` : `${label} ${percent}%`),
  resetsIn: ({ days, hours, minutes }) =>
    days > 0 ? `${days} 天 ${hours} 小时后重置` : hours > 0 ? `${hours} 小时 ${minutes} 分后重置` : `${minutes} 分后重置`,
  resettingSoon: "即将重置",
  updatedAgo: (minutes) => (minutes < 1 ? "刚刚更新" : minutes < 60 ? `${minutes} 分钟前更新` : `${Math.floor(minutes / 60)} 小时前更新`),
  updated: (ago) => `${ago} · 来自 claude-hud`,
  ringLabel: (details) => `Claude 用量：${details}。点击刷新`,
  noData: "暂无 Claude 用量（需要 claude-hud 写出用量快照）",
};

export const en: ClaudeUsageText = {
  fiveHour: "5h",
  sevenDay: "7d",
  window: (label, percent, reset) => (reset ? `${label} ${percent}% · ${reset}` : `${label} ${percent}%`),
  resetsIn: ({ days, hours, minutes }) =>
    days > 0 ? `resets in ${days}d ${hours}h` : hours > 0 ? `resets in ${hours}h ${minutes}m` : `resets in ${minutes}m`,
  resettingSoon: "resetting soon",
  updatedAgo: (minutes) => (minutes < 1 ? "updated just now" : minutes < 60 ? `updated ${minutes} min ago` : `updated ${Math.floor(minutes / 60)} h ago`),
  updated: (ago) => `${ago} · via claude-hud`,
  ringLabel: (details) => `Claude usage: ${details}. Click to refresh`,
  noData: "No Claude usage yet (needs claude-hud's usage snapshot)",
};
