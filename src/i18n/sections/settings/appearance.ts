export type SettingsAppearanceText = {
  font: string;
  fontLabel: string;
  fontSize: string;
  collapsedDimensions: { autoWidth: string; autoMin: string; autoMax: string; width: string; height: string; padding: string; unit: string; hint: string };
  systemFont: string;
  pixelFont: string;
  loadingLocalFonts: string;
  localFontsFailed: string;
  localFontMissing: string;
  /** Material: classic, liquid glass, or frosted glass. */
  material: string;
  classic: string;
  liquidGlass: string;
  frostedGlass: string;
  glassStrength: string;
  /** How much the glass blurs the wallpaper behind it, and what it blurs. */
  glassBlur: string;
  glassBlurHint: string;
  /** Colour scheme: dark, light, or following Windows. */
  colorScheme: string;
  schemeDark: string;
  schemeLight: string;
  schemeSystem: string;
  /** Group titles, one kind of setting each (2026-11-19, docs/design/settings.md): the scheme and
      material; the font; every size; every corner. */
  themeTitle: string;
  textSizeTitle: string;
  sizeTitle: string;
  cornersTitle: string;
  /** The collapsed and the open island's overall size, two sliders. */
  collapsedScale: string;
  expandedScale: string;
  pageButtons: string;
  capsules: string;
  icons: string;
  iconsAndLabels: string;
  /** Notch (flush with the top edge) or capsule (a floating pill, islandShape.ts). */
  islandShape: string;
  islandShapeHint: string;
  islandShapes: { notch: string; capsule: string };
  topEdgeShoulders: string;
  topEdgeShouldersHint: string;
  topEdgeShoulderSize: string;
  /** The open island's corner radius and shape; the collapsed bar's corners follow. */
  cornerRadius: string;
  cornerRadiusHint: string;
  collapsedCornerRadius: string;
  cornerShape: string;
  cornerShapes: { squircle: string; round: string };
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
    idleText: { title: string; hint: string; placeholder: string; pendingTitle: string; pendingHint: string; pendingCount: string; pendingIdleText: string };
    layout: {
      title: string;
      footer: string;
      reset: string;
      slots: Record<"pulse" | "text" | "mail" | "shelf" | "music" | "agents" | "clock" | "weather", string>;
      textSample: string;
      moveLabel: (name: string) => string;
      /** The box under the island for what is dragged off it. */
      hidden: string;
      hiddenEmpty: string;
      hiddenLabel: (name: string) => string;
    };
  };
};

export const zhCN: SettingsAppearanceText = {
  font: "字体",
  fontLabel: "岛屿字体",
  fontSize: "字号",
  collapsedDimensions: { autoWidth: "根据内容自动调整长度", autoMin: "最短", autoMax: "最长", width: "宽度", height: "高度", padding: "两侧留白", unit: "px", hint: "宽度和高度指收起时的岛，会随收起时的大小一起缩放。" },
  systemFont: "默认字体",
  pixelFont: "像素字体",
  loadingLocalFonts: "正在读取本机字体…",
  localFontsFailed: "无法读取本机字体。重新打开列表可重试。",
  localFontMissing: "找不到此字体，岛屿使用默认字体",
  material: "质感",
  classic: "经典",
  liquidGlass: "液态玻璃",
  frostedGlass: "磨砂玻璃",
  glassStrength: "玻璃强度",
  glassBlur: "背景模糊",
  glassBlurHint: "实时模糊岛屿后面的画面",
  colorScheme: "配色",
  schemeDark: "深色",
  schemeLight: "浅色",
  schemeSystem: "跟随系统",
  themeTitle: "主题",
  textSizeTitle: "文字",
  sizeTitle: "大小",
  cornersTitle: "圆角",
  collapsedScale: "收起时的大小",
  expandedScale: "展开后的大小",
  pageButtons: "页面按钮",
  capsules: "胶囊",
  icons: "图标",
  iconsAndLabels: "图标加文字",
  islandShape: "岛屿外形",
  islandShapeHint: "胶囊悬在屏幕顶端下方，收起时是一颗完整的药丸",
  islandShapes: { notch: "刘海", capsule: "胶囊" },
  topEdgeShoulders: "贴边圆角",
  topEdgeShouldersHint: "贴在屏幕顶端时，两侧圆滑地连到屏幕边上",
  topEdgeShoulderSize: "圆角大小",
  cornerRadius: "展开圆角",
  cornerRadiusHint: "展开后岛屿与内层面板的圆角",
  collapsedCornerRadius: "收起圆角",
  cornerShape: "圆角形状",
  cornerShapes: { squircle: "平滑", round: "圆弧" },
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
    title: "岛屿展示优先级",
    priorityFooter: "几样同时有内容时，收起的岛显示排在最前面的那一样。拖动调整顺序。",
    items: {
      agent: { name: "AI Agent 任务", hint: "正在运行的会话标题" },
      lyrics: { name: "歌词", hint: "播放时的当前一句，没有歌词时显示歌名" },
      todo: { name: "待办", hint: "开始做的待办；没开始时，剩余数量排在最后" },
    },
    moveLabel: (name) => `调整"${name}"的顺序，可以拖动或按上下方向键`,
    showCover: "显示歌曲封面",
    showCoverHint: "显示歌词时，在歌词前面放这首歌的封面",
    idleText: { title: "空闲时显示的文字", hint: "没有别的内容时岛上显示这段文字（最多 40 个字），留空则按“显示标题”的设置显示 fly-island。", placeholder: "fly-island",
      pendingTitle: "有待办但没开始时显示", pendingHint: "有待办、但还没开始做任何一项时，岛上显示什么。", pendingCount: "剩余数量", pendingIdleText: "空闲文字" },
    layout: {
      title: "岛上的排列",
      footer: "按住图标左右拖动，放在文字左边的会显示在岛的左侧；拖进下面的盒子就不在岛上显示。灰色的是还没打开的功能，位置会保留。",
      reset: "恢复默认",
      slots: { pulse: "状态灯", text: "文字", mail: "新邮件", shelf: "置物架文件数", music: "音乐波形", agents: "Agent 会话数", clock: "时间", weather: "天气" },
      textSample: "示例待办",
      moveLabel: (name) => `移动"${name}"，可以拖动或按左右方向键；按下方向键放进下面的盒子，不在岛上显示`,
      hidden: "不在岛上显示",
      hiddenEmpty: "把图标拖到这里，就不在岛上显示",
      hiddenLabel: (name) => `"${name}"不在岛上显示，拖回岛上或按上方向键放回`,
    },
  },
};

export const en: SettingsAppearanceText = {
  font: "Font",
  fontLabel: "Island font",
  fontSize: "Font size",
  collapsedDimensions: { autoWidth: "Adjust length to the content", autoMin: "Shortest", autoMax: "Longest", width: "Width", height: "Height", padding: "Side space", unit: "px", hint: "Width and height are the collapsed island's, and follow the collapsed size." },
  systemFont: "System",
  pixelFont: "Pixel",
  loadingLocalFonts: "Loading installed fonts…",
  localFontsFailed: "Couldn't read installed fonts. Reopen the list to retry.",
  localFontMissing: "This font is unavailable. The island is using the default font.",
  material: "Material",
  classic: "Classic",
  liquidGlass: "Liquid",
  frostedGlass: "Frosted",
  glassStrength: "Glass strength",
  glassBlur: "Background blur",
  glassBlurHint: "Blurs whatever is behind the island, live",
  colorScheme: "Color scheme",
  schemeDark: "Dark",
  schemeLight: "Light",
  schemeSystem: "System",
  themeTitle: "Theme",
  textSizeTitle: "Text",
  sizeTitle: "Size",
  cornersTitle: "Corners",
  collapsedScale: "Collapsed size",
  expandedScale: "Expanded size",
  pageButtons: "Page buttons",
  capsules: "Capsules",
  icons: "Icons",
  iconsAndLabels: "Icons & labels",
  islandShape: "Island shape",
  islandShapeHint: "The capsule floats just below the top of the screen and collapses to a full pill",
  islandShapes: { notch: "Notch", capsule: "Capsule" },
  topEdgeShoulders: "Top edge curves",
  topEdgeShouldersHint: "At the top of the screen, the island's sides curve into the screen edge",
  topEdgeShoulderSize: "Curve size",
  cornerRadius: "Open corners",
  cornerRadiusHint: "The open island and the panels inside it",
  collapsedCornerRadius: "Collapsed corners",
  cornerShape: "Corner shape",
  cornerShapes: { squircle: "Smooth", round: "Round" },
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
    title: "Island display priority",
    priorityFooter: "When several have something to show, the collapsed island shows the first. Drag to reorder.",
    items: {
      agent: { name: "AI Agent task", hint: "The running session's title" },
      lyrics: { name: "Lyrics", hint: "The current line while a song plays, or its title" },
      todo: { name: "Todos", hint: "The todo you started; until then, the count left comes last" },
    },
    moveLabel: (name) => `Reorder "${name}": drag, or press the up and down arrow keys`,
    showCover: "Show the song's cover",
    showCoverHint: "The song's cover in front of the lyric line",
    idleText: { title: "Idle text", hint: "Shown when nothing else is (up to 40 characters). Empty keeps fly-island, as the Show title setting decides.", placeholder: "fly-island",
      pendingTitle: "When todos are pending but none started", pendingHint: "What the island shows when there are todos but you have not started one.", pendingCount: "Count left", pendingIdleText: "Idle text" },
    layout: {
      title: "On the island",
      footer: "Hold an icon and drag it left or right; icons left of the text sit on the island's left. Drop one in the box below to take it off the island. Grey ones are switched off and keep their place.",
      reset: "Reset",
      slots: { pulse: "Status light", text: "Text", mail: "New mail", shelf: "Shelf files", music: "Music waveform", agents: "Agent sessions", clock: "Time", weather: "Weather" },
      textSample: "Sample task",
      moveLabel: (name) => `Move "${name}": drag, or press the left and right arrow keys; the down arrow takes it off the island`,
      hidden: "Not on the island",
      hiddenEmpty: "Drag an icon here to take it off the island",
      hiddenLabel: (name) => `"${name}" is off the island: drag it back, or press the up arrow`,
    },
  },
};
