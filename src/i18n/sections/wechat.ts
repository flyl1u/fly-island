export type WechatText = {
  desktopOnly: string;
  receive: string;
  pause: string;
  open: string;
  /** Under the WeChat tab's icon, which opens WeChat. */
  clickToOpen: string;
  noReminders: string;
  status: {
    disabled: string;
    waiting: string;
    listening: string;
    error: string;
  };
};

export const zhCN: WechatText = {
  desktopOnly: "请在 Windows 桌面版中使用微信提醒。",
  receive: "接收微信提醒",
  pause: "暂停微信提醒",
  open: "打开微信",
  clickToOpen: "点击打开微信",
  noReminders: "暂无提醒",
  status: {
    disabled: "已暂停",
    waiting: "连接中",
    listening: "已连接",
    error: "连接失败，正在重试",
  },
};

export const en: WechatText = {
  desktopOnly: "Use the Windows desktop app for WeChat reminders.",
  receive: "Receive WeChat reminders",
  pause: "Pause WeChat reminders",
  open: "Open WeChat",
  clickToOpen: "Click to open WeChat",
  noReminders: "No reminders",
  status: {
    disabled: "Paused",
    waiting: "Connecting",
    listening: "Connected",
    error: "Connection failed, retrying",
  },
};
