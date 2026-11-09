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
    /**
     * Sample Agent sessions: one waiting for approval (also the collapsed bar's title), one
     * asking, one done. Their states and times come from the Agent page's own strings.
     */
    sessions: {
      needs: { project: string; title: string };
      yourTurn: { project: string; title: string };
      done: { project: string; title: string };
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
    sessions: {
      needs: { project: "fly-island", title: "设置页切换动画" },
      yourTurn: { project: "notes", title: "整理周报大纲" },
      done: { project: "api-server", title: "修复登录超时" },
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
    sessions: {
      needs: { project: "fly-island", title: "Settings page transition" },
      yourTurn: { project: "notes", title: "Weekly report outline" },
      done: { project: "api-server", title: "Fix the login timeout" },
    },
  },
};
