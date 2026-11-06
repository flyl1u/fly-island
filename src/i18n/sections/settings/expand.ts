export type SettingsExpandText = {
  title: string;
  trigger: string;
  click: string;
  hover: string;
  hoverDelay: string;
  hoverCollapseDelay: string;
  /** Title of the group for tucking to the screen edge. */
  tuckTitle: string;
  /** Title of the group for how a tucked island comes back. */
  revealTitle: string;
  revealOnMessage: string;
  /** What hovering an island tucked to the edge does. */
  tuckedHover: string;
  tuckedHoverReveal: string;
  tuckedHoverExpand: string;
};

export const zhCN: SettingsExpandText = {
  title: "展开",
  trigger: "展开方式",
  click: "点击",
  hover: "鼠标悬停",
  hoverDelay: "悬停多久后展开",
  hoverCollapseDelay: "鼠标移开后收起前等待",
  tuckTitle: "贴边隐藏",
  revealTitle: "露出",
  revealOnMessage: "有新消息时露出",
  tuckedHover: "鼠标移到隐藏的岛上",
  tuckedHoverReveal: "只露出岛屿",
  tuckedHoverExpand: "展开面板",
};

export const en: SettingsExpandText = {
  title: "Opening",
  trigger: "Open the island by",
  click: "Click",
  hover: "Hover",
  hoverDelay: "Hover time before opening",
  hoverCollapseDelay: "Wait before closing after leaving",
  tuckTitle: "Tuck to edge",
  revealTitle: "Sliding out",
  revealOnMessage: "Slide out for new messages",
  tuckedHover: "Pointer on a tucked island",
  tuckedHoverReveal: "Slides it out",
  tuckedHoverExpand: "Opens the panel",
};
