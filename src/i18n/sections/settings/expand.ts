export type SettingsExpandText = {
  title: string;
  trigger: string;
  click: string;
  hover: string;
  /** How long an open panel waits without use before it closes by itself. */
  autoCollapse: string;
  autoCollapseHint: string;
  seconds: (seconds: number) => string;
  never: string;
};

export const zhCN: SettingsExpandText = {
  title: "岛屿",
  trigger: "展开方式",
  click: "点击",
  hover: "鼠标悬停",
  autoCollapse: "展开后自动收起",
  autoCollapseHint: "这么久没有操作，展开的岛自动收起。",
  seconds: (seconds) => `${seconds} 秒`,
  never: "从不",
};

export const en: SettingsExpandText = {
  title: "Island",
  trigger: "Open the island by",
  click: "Click",
  hover: "Hover",
  autoCollapse: "Collapse after",
  autoCollapseHint: "The open island collapses after this long without use.",
  seconds: (seconds) => `${seconds} s`,
  never: "Never",
};
