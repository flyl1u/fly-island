export type SettingsAppearanceText = {
  font: string;
  fontLabel: string;
  systemFont: string;
  pixelFont: string;
  title: string;
  classic: string;
  liquidGlass: string;
  glassStrength: string;
  styleTitle: string;
  /** The island preview at the top of the page: sample content and the two captions. */
  preview: {
    label: string;
    collapsed: string;
    expanded: string;
    task: string;
    todos: [string, string, string];
  };
};

export const zhCN: SettingsAppearanceText = {
  font: "字体",
  fontLabel: "岛屿字体",
  systemFont: "默认字体",
  pixelFont: "像素字体",
  title: "外观模式",
  classic: "经典",
  liquidGlass: "液态玻璃",
  glassStrength: "玻璃强度",
  styleTitle: "风格",
  preview: {
    label: "按当前设置画出的岛屿",
    collapsed: "折叠",
    expanded: "展开",
    task: "写周报",
    todos: ["写周报", "回复设计评审", "订周五的会议室"],
  },
};

export const en: SettingsAppearanceText = {
  font: "Font",
  fontLabel: "Island font",
  systemFont: "System",
  pixelFont: "Pixel",
  title: "Appearance",
  classic: "Classic",
  liquidGlass: "Liquid glass",
  glassStrength: "Glass strength",
  styleTitle: "Style",
  preview: {
    label: "The island with the current settings",
    collapsed: "Collapsed",
    expanded: "Expanded",
    task: "Weekly report",
    todos: ["Weekly report", "Reply to the design review", "Book Friday's meeting room"],
  },
};
