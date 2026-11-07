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
    /** The expanded island shows the Agent page: one session running, one asking, one done. */
    sessions: {
      running: { project: string; title: string; reply: string };
      yourTurn: { project: string; title: string; status: string };
      done: { project: string; title: string; age: string };
    };
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
    sessions: {
      running: { project: "fly-island", title: "设置页切换动画", reply: "侧栏高亮条已经加上动画，接着跑检查" },
      yourTurn: { project: "notes", title: "整理周报大纲", status: "等你回复 · 1 分钟前" },
      done: { project: "api-server", title: "修复登录超时", age: "12 分钟前" },
    },
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
    sessions: {
      running: { project: "fly-island", title: "Settings page transition", reply: "Animated the sidebar bar, running the checks next" },
      yourTurn: { project: "notes", title: "Weekly report outline", status: "Your turn · 1 min ago" },
      done: { project: "api-server", title: "Fix the login timeout", age: "12 min ago" },
    },
  },
};
