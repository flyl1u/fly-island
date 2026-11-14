export type SettingsExpandText = {
  title: string;
  /** The group of auto-tuck, its delay and the tucked look. */
  tuckTitle: string;
  trigger: string;
  click: string;
  hover: string;
  /** (A) Seconds after the cursor leaves the open island before it collapses. */
  autoCollapse: string;
  autoCollapseHint: string;
  /** (B) Seconds the collapsed island idles before it tucks into a line. */
  tuckDelay: string;
  tuckDelayHint: string;
  /** How the tucked island looks: the island's rim, a short line, or nothing. */
  tuckStyle: string;
  tuckStyles: { edge: string; line: string; hidden: string };
  /** Unit after the number fields. */
  secondsUnit: string;
};

export const zhCN: SettingsExpandText = {
  title: "展开与收起",
  tuckTitle: "贴边隐藏",
  trigger: "展开方式",
  click: "点击",
  hover: "鼠标悬停",
  autoCollapse: "展开后自动收起",
  autoCollapseHint: "鼠标离开展开的岛屿多少秒后收回成小岛；填 0 不自动收起。",
  tuckDelay: "收起后贴边",
  tuckDelayHint: "收起的小岛闲置多少秒后贴到屏幕顶部。",
  tuckStyle: "贴边样式",
  tuckStyles: { edge: "露边", line: "细线", hidden: "隐藏" },
  secondsUnit: "秒",
};

export const en: SettingsExpandText = {
  title: "Opening & closing",
  tuckTitle: "Tuck to the edge",
  trigger: "Open the island by",
  click: "Click",
  hover: "Hover",
  autoCollapse: "Collapse the open island",
  autoCollapseHint: "Seconds after the cursor leaves the open island before it collapses; 0 keeps it open.",
  tuckDelay: "Tuck the collapsed island",
  tuckDelayHint: "Seconds the collapsed island sits idle before it slides up to the top edge.",
  tuckStyle: "Tucked look",
  tuckStyles: { edge: "Edge", line: "Line", hidden: "Hidden" },
  secondsUnit: "s",
};
