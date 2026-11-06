import type { AgentUsageErrorKind } from "../../features/agent-status/api";

export type ResetParts = { days: number; hours: number; minutes: number };

export type ClaudeUsageText = {
  fiveHour: string;
  sevenDay: string;
  /** "5 小时 42% · 2 小时 13 分后重置"; `reset` is null when the snapshot gave no reset time. */
  window: (label: string, percent: number, reset: string | null) => string;
  resetsIn: (parts: ResetParts) => string;
  resettingSoon: string;
  updatedAgo: (minutes: number) => string;
  fromHud: string;
  fromApi: string;
  fromMagpie: string;
  /** "3 分钟前更新 · 来自 claude-hud". */
  updated: (ago: string, source: string) => string;
  /** The ring button's label: what the card says, and that a click re-reads it. */
  ringLabel: (details: string) => string;
  noData: string;
  /** Why asking Anthropic directly failed; one per AgentUsageErrorKind in features/agent-status/api.ts. */
  errors: Record<AgentUsageErrorKind, string>;
};

export const zhCN: ClaudeUsageText = {
  fiveHour: "5 小时",
  sevenDay: "7 天",
  window: (label, percent, reset) => (reset ? `${label} ${percent}% · ${reset}` : `${label} ${percent}%`),
  resetsIn: ({ days, hours, minutes }) =>
    days > 0 ? `${days} 天 ${hours} 小时后重置` : hours > 0 ? `${hours} 小时 ${minutes} 分后重置` : `${minutes} 分后重置`,
  resettingSoon: "即将重置",
  updatedAgo: (minutes) => (minutes < 1 ? "刚刚更新" : minutes < 60 ? `${minutes} 分钟前更新` : `${Math.floor(minutes / 60)} 小时前更新`),
  fromHud: "来自 claude-hud",
  fromApi: "来自 Anthropic",
  fromMagpie: "来自 magpie",
  updated: (ago, source) => `${ago} · ${source}`,
  ringLabel: (details) => `Claude 用量：${details}。点击刷新`,
  noData: "暂无 Claude 用量（需要本机的 magpie 网关、claude-hud 的用量快照，或在插件设置里打开「直接向 Anthropic 查询」）",
  errors: {
    noCredentials: "未找到 Claude Code 的订阅登录，请先在 Claude Code 里登录",
    tokenExpired: "登录已过期，打开 Claude Code 以刷新登录",
    loginRequired: "需要在 Claude Code 里重新登录",
    forbidden: "当前登录无权读取用量，可尝试在 Claude Code 里重新登录",
    rateLimited: "请求过于频繁，稍后自动重试",
    noProxy: "没有代理：请在插件设置里填写代理地址",
    network: "无法通过代理连接 Anthropic",
    http: "Anthropic 返回了错误",
    invalidResponse: "无法识别 Anthropic 返回的用量",
  },
};

export const en: ClaudeUsageText = {
  fiveHour: "5h",
  sevenDay: "7d",
  window: (label, percent, reset) => (reset ? `${label} ${percent}% · ${reset}` : `${label} ${percent}%`),
  resetsIn: ({ days, hours, minutes }) =>
    days > 0 ? `resets in ${days}d ${hours}h` : hours > 0 ? `resets in ${hours}h ${minutes}m` : `resets in ${minutes}m`,
  resettingSoon: "resetting soon",
  updatedAgo: (minutes) => (minutes < 1 ? "updated just now" : minutes < 60 ? `updated ${minutes} min ago` : `updated ${Math.floor(minutes / 60)} h ago`),
  fromHud: "via claude-hud",
  fromApi: "from Anthropic",
  fromMagpie: "from magpie",
  updated: (ago, source) => `${ago} · ${source}`,
  ringLabel: (details) => `Claude usage: ${details}. Click to refresh`,
  noData: "No Claude usage yet (needs a local magpie gateway, claude-hud's usage snapshot, or \"Ask Anthropic directly\" in the plugin settings)",
  errors: {
    noCredentials: "No Claude Code subscription login found; sign in to Claude Code first",
    tokenExpired: "Login expired; open Claude Code to renew it",
    loginRequired: "Sign in again in Claude Code",
    forbidden: "This login may not read usage; try signing in again in Claude Code",
    rateLimited: "Rate limited; retrying later",
    noProxy: "No proxy; set one in the plugin settings",
    network: "Can't reach Anthropic through the proxy",
    http: "Anthropic returned an error",
    invalidResponse: "Unrecognized usage answer from Anthropic",
  },
};
