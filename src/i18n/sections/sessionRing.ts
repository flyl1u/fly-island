/** The collapsed bar's session ring (features/session-ring). */
export type SessionRingText = {
  needs: string;
  yourturn: string;
  working: string;
  stale: string;
  done: string;
  empty: string;
  /** A session waiting on you in the ring's hover card: its state, then "title · project". */
  sessionLine: (state: string, name: string) => string;
  /** The ring button's label: its summary, then what a click does. */
  openAgents: (summary: string) => string;
};

export const zhCN: SessionRingText = {
  needs: "等你确认",
  yourturn: "等你回复",
  working: "运行",
  stale: "可能已停",
  done: "完成",
  empty: "没有 Agent 会话",
  sessionLine: (state, name) => `${state}：${name}`,
  openAgents: (summary) => `${summary}，点击打开 Agent 页`,
};

export const en: SessionRingText = {
  needs: "Needs you",
  yourturn: "Your turn",
  working: "Running",
  stale: "Maybe stalled",
  done: "Done",
  empty: "No agent sessions",
  sessionLine: (state, name) => `${state}: ${name}`,
  openAgents: (summary) => `${summary}. Click to open the Agent page`,
};
