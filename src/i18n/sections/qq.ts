export type QqText = {
  desktopOnly: string;
  receive: string;
  title: string;
  pause: string;
  resume: string;
  allow: string;
  allowLabel: string;
  grant: string;
  settings: string;
  retry: string;
  retryLabel: string;
  recent: string;
  open: string;
  refresh: string;
  clear: string;
  list: string;
  status: {
    disabled: string;
    waiting: string;
    listening: string;
    permissionDenied: string;
    permissionRequired: string;
    error: string;
  };
  openNotification: (title: string) => string;
};

export const zhCN: QqText = {
  desktopOnly: "请在 Windows 桌面版中使用 QQ 消息。",
  receive: "接收 QQ 消息",
  title: "QQ 消息",
  pause: "暂停 QQ 通知",
  resume: "接收 QQ 通知",
  allow: "允许通知访问",
  allowLabel: "允许 QQ 通知访问",
  grant: "授权",
  settings: "打开 Windows 通知设置",
  retry: "重试授权",
  retryLabel: "重试 QQ 通知授权",
  recent: "QQ 最近通知",
  open: "打开 QQ",
  refresh: "刷新 QQ 通知状态",
  clear: "清空岛内 QQ 通知",
  list: "最近收到的 QQ 通知",
  status: {
    disabled: "已暂停",
    waiting: "连接中",
    listening: "已连接",
    permissionDenied: "通知权限被拒绝",
    permissionRequired: "需要通知权限",
    error: "连接失败",
  },
  openNotification: (title) => `打开 QQ：${title}`,
};

export const en: QqText = {
  desktopOnly: "Use the Windows desktop app for QQ notifications.",
  receive: "Receive QQ messages",
  title: "QQ messages",
  pause: "Pause QQ notifications",
  resume: "Receive QQ notifications",
  allow: "Allow notification access",
  allowLabel: "Allow access to QQ notifications",
  grant: "Allow",
  settings: "Open Windows notification settings",
  retry: "Retry authorization",
  retryLabel: "Retry QQ notification authorization",
  recent: "Recent QQ notifications",
  open: "Open QQ",
  refresh: "Refresh QQ notifications",
  clear: "Clear QQ notifications in the island",
  list: "Recently received QQ notifications",
  status: {
    disabled: "Paused",
    waiting: "Connecting",
    listening: "Connected",
    permissionDenied: "Notification access denied",
    permissionRequired: "Notification access required",
    error: "Connection failed",
  },
  openNotification: (title) => `Open QQ: ${title}`,
};
