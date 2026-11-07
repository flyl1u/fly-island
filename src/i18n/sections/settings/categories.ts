export type SettingsCategoriesText = {
  label: string;
  /** The search box at the top of the sidebar. */
  search: {
    placeholder: string;
    clear: string;
    empty: string;
  };
  /** Each group's pages fold under its row; what the row says to a screen reader. */
  expand: (group: string) => string;
  collapse: (group: string) => string;
  /** Words that also find a page in the sidebar search, besides its name. */
  keywords: Record<
    | "general" | "appearance" | "shortcuts" | "todos" | "calendar" | "music" | "translation" | "clipboard"
    | "shelf" | "messages" | "agents" | "agentRemote" | "agentAlerts" | "sounds" | "agentApprovals" | "agentConnect"
    | "plugins" | "market" | "about",
    string
  >;
  groups: {
    basics: string;
    features: string;
    agents: string;
    extensions: string;
  };
  general: string;
  appearance: string;
  shortcuts: string;
  /** QQ, WeChat and Mail on one page. */
  messages: string;
  /** Mail's group on the Messages page. */
  mail: string;
  todos: string;
  music: string;
  clipboard: string;
  translation: string;
  shelf: string;
  calendar: string;
  /** The AI Agent group's pages. */
  agents: string;
  /** Sessions on other computers, read over SSH. */
  agentRemote: string;
  agentAlerts: string;
  sounds: string;
  agentApprovals: string;
  agentConnect: string;
  plugins: string;
  market: string;
  about: string;
};

export const zhCN: SettingsCategoriesText = {
  label: "设置分类",
  search: {
    placeholder: "搜索设置",
    clear: "清除搜索",
    empty: "没有匹配的页面",
  },
  expand: (group) => `展开「${group}」`,
  collapse: (group) => `折叠「${group}」`,
  keywords: {
    general: "开机 自启 语言 展开 悬停 收起 贴边 隐藏 全屏 游戏 勿扰 位置 显示器 屏幕 音量 亮度 耳机 蓝牙 电量 电源 摄像头 麦克风 备份 恢复",
    appearance: "颜色 背景 透明 不透明度 液态玻璃 字体 像素 圆角 尺寸 大小 缩放 预设 样式 预览 亮点",
    shortcuts: "按键 组合键 热键 翻页",
    todos: "任务 笔记 归档 保存路径 导出 Markdown",
    calendar: "日程 会议 CalDAV ICS 订阅 节假日",
    music: "歌词 媒体 播放 波形 酷狗 网易云",
    translation: "翻译服务 模型 密钥 API 语言",
    clipboard: "复制 粘贴 历史 图片",
    shelf: "文件 拖放 拖拽 清理",
    messages: "QQ 微信 邮箱 邮件 通知 IMAP 授权码",
    agents: "Claude Code Codex 会话列表 标题 用量 隐藏会话",
    agentRemote: "SSH 远程 服务器 主机 其他电脑",
    agentAlerts: "弹出 提醒 通知 回复状态标记",
    sounds: "音效 声音包 提示音",
    agentApprovals: "批准 允许 拒绝 权限 提问 回答",
    agentConnect: "钩子 hook 安装 修复",
    plugins: "扩展 已安装 插件目录 开发者 更新 岛屿页面",
    market: "扩展 插件 下载 安装 搜索",
    about: "版本 更新 检查更新 测试版 通道 重置 退出 反馈 Star",
  },
  groups: {
    basics: "基础",
    features: "功能",
    agents: "AI Agent",
    extensions: "扩展",
  },
  general: "通用",
  appearance: "外观",
  shortcuts: "快捷键",
  messages: "消息",
  mail: "邮箱",
  todos: "待办",
  music: "音乐",
  clipboard: "剪贴板",
  translation: "翻译",
  shelf: "文件中转",
  calendar: "日历",
  agents: "会话",
  agentRemote: "远程电脑",
  agentAlerts: "提醒",
  sounds: "声音",
  agentApprovals: "审批",
  agentConnect: "连接",
  plugins: "插件",
  market: "插件市场",
  about: "关于",
};

export const en: SettingsCategoriesText = {
  label: "Settings categories",
  search: {
    placeholder: "Search settings",
    clear: "Clear search",
    empty: "No matching page",
  },
  expand: (group) => `Expand ${group}`,
  collapse: (group) => `Collapse ${group}`,
  keywords: {
    general: "startup launch language expand hover collapse tuck hide fullscreen game quiet position display monitor volume brightness headphones bluetooth battery charger camera microphone backup restore",
    appearance: "colour color background opacity transparency glass font pixel corner size scale preset style preview pulse",
    shortcuts: "keys hotkey keyboard page",
    todos: "tasks notes archive save folder export markdown",
    calendar: "events meeting caldav ics subscription holidays",
    music: "lyrics media playback waveform kugou netease",
    translation: "service model key api language",
    clipboard: "copy paste history images",
    shelf: "files drag drop cleanup",
    messages: "qq wechat mail email notifications imap",
    agents: "claude code codex sessions list title usage hide",
    agentRemote: "ssh remote server host other computers",
    agentAlerts: "pop-up alerts notifications reply status marker",
    sounds: "sound pack",
    agentApprovals: "approve allow deny permission questions answer",
    agentConnect: "hooks install repair",
    plugins: "extensions installed folder developer updates island pages",
    market: "extensions plugins download install browse",
    about: "version updates check beta channel reset quit feedback star",
  },
  groups: {
    basics: "Basics",
    features: "Features",
    agents: "AI Agent",
    extensions: "Extensions",
  },
  general: "General",
  appearance: "Appearance",
  shortcuts: "Shortcuts",
  messages: "Messages",
  mail: "Mail",
  todos: "Todos",
  music: "Music",
  clipboard: "Clipboard",
  translation: "Translation",
  shelf: "File shelf",
  calendar: "Calendar",
  agents: "Sessions",
  agentRemote: "Remote computers",
  agentAlerts: "Alerts",
  sounds: "Sounds",
  agentApprovals: "Approvals",
  agentConnect: "Connection",
  plugins: "Plugins",
  market: "Plugin market",
  about: "About",
};
