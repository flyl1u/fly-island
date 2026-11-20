export type SettingsMessageSourcesText = {
  previewTitle: string;
  previewSeconds: string;
  autoExpand: string;
  autoExpandHint: string;
  expandMaxWidth: string;
  expandMaxHeight: string;
  expandSeconds: string;
  gameNotices: string;
  gameNoticesHint: string;
  gameNoticeSeconds: string;
  qqTitle: string;
  qqHint: string;
  wechatTitle: string;
  wechatHint: string;
  autoCopyOtp: string;
};

export const zhCN: SettingsMessageSourcesText = {
  previewTitle: "岛上通知",
  previewSeconds: "停留时长",
  autoExpand: "长消息自动展开",
  autoExpandHint: "收到较长的通知时，岛屿随文字变宽变高，直接在岛上读完、选中复制；超过上限后可滚动阅读。",
  expandMaxWidth: "最大宽度",
  expandMaxHeight: "最大高度",
  expandSeconds: "展开时停留",
  gameNotices: "仍显示通知",
  gameNoticesHint: "全屏游戏时也在岛上显示通知，只做显示：不抢焦点，鼠标点击会穿过岛屿落到游戏里。",
  gameNoticeSeconds: "通知停留时长",
  autoCopyOtp: "自动复制验证码",
  qqTitle: "QQ 通知",
  qqHint: "通过 Windows 通知读取 QQ 消息的标题和预览，只保留在本次运行的内存中。需要 QQ 已登录并开启系统通知。",
  wechatTitle: "微信提醒",
  wechatHint: "监听电脑版微信任务栏提醒；开启消息摘要后只读取普通联系人、群聊和文件传输助手，不展示公众号、订阅号、服务号等官方账号。需要微信保持登录。",
};

export const en: SettingsMessageSourcesText = {
  previewTitle: "Island notifications",
  previewSeconds: "Display duration",
  autoExpand: "Expand long messages",
  autoExpandHint: "A longer notification grows the island with its text, so you can read and copy it right there; past the limit it scrolls.",
  expandMaxWidth: "Maximum width",
  expandMaxHeight: "Maximum height",
  expandSeconds: "Expanded duration",
  gameNotices: "Still show notifications",
  gameNoticesHint: "Shows notifications on the island during full-screen games, for display only: it never takes the focus, and clicks pass through to the game.",
  gameNoticeSeconds: "Notification duration",
  autoCopyOtp: "Auto-copy verification codes",
  qqTitle: "QQ notifications",
  qqHint: "Reads the title and preview of QQ messages from Windows notifications and keeps them in memory for this run only. QQ must be signed in with system notifications on.",
  wechatTitle: "WeChat reminders",
  wechatHint: "Watches WeChat desktop taskbar reminders; with message previews on, it reads only contacts, group chats and File Transfer Assistant and hides official accounts such as public and service accounts. WeChat must stay signed in.",
};
