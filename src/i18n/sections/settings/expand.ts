export type SettingsExpandText = {
  title: string;
  trigger: string;
  click: string;
  hover: string;
  hoverDelay: string;
  hoverCollapseDelay: string;
  revealOnMessage: string;
  /** What hovering an island tucked to the edge does. */
  tuckedHover: string;
  tuckedHoverReveal: string;
  tuckedHoverExpand: string;
};

export const zhCN: SettingsExpandText = {
  title: "展开与收起",
  trigger: "展开方式",
  click: "点击",
  hover: "鼠标悬停",
  hoverDelay: "悬停延迟",
  hoverCollapseDelay: "移开后收起延迟",
  revealOnMessage: "收起到边缘时，收到新消息自动露出",
  tuckedHover: "收起时鼠标移上去",
  tuckedHoverReveal: "只露出岛屿",
  tuckedHoverExpand: "展开面板",
};

export const en: SettingsExpandText = {
  title: "Open & close",
  trigger: "Open the island by",
  click: "Click",
  hover: "Hover",
  hoverDelay: "Hover delay",
  hoverCollapseDelay: "Close delay after leaving",
  revealOnMessage: "Slide out from the edge for new messages",
  tuckedHover: "Hovering a tucked island",
  tuckedHoverReveal: "Slides it out",
  tuckedHoverExpand: "Opens the panel",
};
