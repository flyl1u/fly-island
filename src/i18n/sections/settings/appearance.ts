export type SettingsAppearanceText = {
  font: string;
  fontLabel: string;
  fontSize: string;
  collapsedDimensions: { title: string; autoWidth: string; width: string; height: string; unit: string; hint: string };
  systemFont: string;
  pixelFont: string;
  title: string;
  classic: string;
  liquidGlass: string;
  glassStrength: string;
  styleTitle: string;
  pageButtons: string;
  capsules: string;
  icons: string;
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
  /** The "Collapsed island" group: what its text shows first, and the song's cover. */
  collapsedIsland: {
    title: string;
    priorityFooter: string;
    items: Record<"agent" | "lyrics" | "todo", { name: string; hint: string }>;
    /** The drag handle of one item; arrow keys on it move the item too. */
    moveLabel: (name: string) => string;
    showCover: string;
    showCoverHint: string;
    layout: {
      title: string;
      footer: string;
      reset: string;
      slots: Record<"text" | "mail" | "shelf" | "music" | "agents", string>;
      textSample: string;
      moveLabel: (name: string) => string;
    };
  };
};

export const zhCN: SettingsAppearanceText = {
  font: "字体",
  fontLabel: "岛屿字体",
  fontSize: "岛屿字号",
  collapsedDimensions: { title: "刘海尺寸", autoWidth: "自动宽度", width: "刘海宽度", height: "刘海高度", unit: "px", hint: "宽高会随收起时的整体大小一起缩放。" },
  systemFont: "默认字体",
  pixelFont: "像素字体",
  title: "外观模式",
  classic: "经典",
  liquidGlass: "液态玻璃",
  glassStrength: "玻璃强度",
  styleTitle: "风格",
  pageButtons: "页面按钮",
  capsules: "胶囊",
  icons: "图标",
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
  collapsedIsland: {
    title: "收起的岛",
    priorityFooter: "几样同时有内容时，收起的岛显示排在最前面的那一样。拖动调整顺序。",
    items: {
      agent: { name: "AI Agent 任务", hint: "正在运行的会话标题" },
      lyrics: { name: "歌词", hint: "播放时的当前一句，没有歌词时显示歌名" },
      todo: { name: "待办", hint: "开始做的待办；没开始时，剩余数量排在最后" },
    },
    moveLabel: (name) => `调整"${name}"的顺序，可以拖动或按上下方向键`,
    showCover: "显示歌曲封面",
    showCoverHint: "收起的岛显示歌词时，在歌词前显示这首歌的封面；排在歌词前面的内容显示时，封面也一起让开。",
    layout: {
      title: "岛上的排列",
      footer: "按住图标左右拖动，放在文字左边的会显示在岛的左侧。灰色的是还没打开的功能，位置会保留。",
      reset: "恢复默认",
      slots: { text: "文字", mail: "新邮件", shelf: "置物架文件数", music: "音乐波形", agents: "Agent 会话数" },
      textSample: "收起时的文字",
      moveLabel: (name) => `移动"${name}"，可以拖动或按左右方向键`,
    },
  },
};

export const en: SettingsAppearanceText = {
  font: "Font",
  fontLabel: "Island font",
  fontSize: "Island font size",
  collapsedDimensions: { title: "Collapsed dimensions", autoWidth: "Automatic width", width: "Collapsed width", height: "Collapsed height", unit: "px", hint: "Width and height follow the overall collapsed size." },
  systemFont: "System",
  pixelFont: "Pixel",
  title: "Appearance",
  classic: "Classic",
  liquidGlass: "Liquid glass",
  glassStrength: "Glass strength",
  styleTitle: "Style",
  pageButtons: "Page buttons",
  capsules: "Capsules",
  icons: "Icons",
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
  collapsedIsland: {
    title: "Collapsed island",
    priorityFooter: "When several have something to show, the collapsed island shows the first. Drag to reorder.",
    items: {
      agent: { name: "AI Agent task", hint: "The running session's title" },
      lyrics: { name: "Lyrics", hint: "The current line while a song plays, or its title" },
      todo: { name: "Todos", hint: "The todo you started; until then, the count left comes last" },
    },
    moveLabel: (name) => `Reorder "${name}": drag, or press the up and down arrow keys`,
    showCover: "Show the song's cover",
    showCoverHint: "Beside the lyric line on the collapsed island; when something ranked above lyrics shows, the cover gives way too.",
    layout: {
      title: "On the island",
      footer: "Hold an icon and drag it left or right; icons left of the text sit on the island's left. Grey ones are switched off and keep their place.",
      reset: "Reset",
      slots: { text: "Text", mail: "New mail", shelf: "Shelf files", music: "Music waveform", agents: "Agent sessions" },
      textSample: "Collapsed text",
      moveLabel: (name) => `Move "${name}": drag, or press the left and right arrow keys`,
    },
  },
};
