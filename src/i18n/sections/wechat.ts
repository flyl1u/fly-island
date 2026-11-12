export type WechatText = {
  desktopOnly: string;
  receive: string;
  pause: string;
  open: string;
  /** Under the WeChat tab's icon, which opens WeChat. */
  clickToOpen: string;
  noReminders: string;
  messageList: string;
  openFrom: (contact: string) => string;
  showPreview: string;
  previewHint: string;
  previewStatus: Record<"off" | "waiting" | "ready" | "tray" | "unsupported" | "unavailable", string>;
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
  messageList: "微信消息摘要",
  openFrom: (contact) => `${contact}的消息，点击打开微信`,
  showPreview: "显示联系人和消息摘要",
  previewHint: "临时启用桌面微信的辅助功能。微信最小化时也可读取摘要，摘要仅在岛屿运行期间保留。",
  previewStatus: {
    off: "消息摘要已关闭。",
    waiting: "等待已登录的微信主窗口。",
    ready: "已连接微信会话列表。",
    tray: "微信已收进系统托盘，当前只能接收普通提醒。",
    unsupported: "当前微信版本无法启用摘要，仍可接收普通提醒。",
    unavailable: "暂时读不到会话列表，仍可接收普通提醒。",
  },
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
  messageList: "WeChat message previews",
  openFrom: (contact) => `Message from ${contact}. Open WeChat`,
  showPreview: "Show contacts and message previews",
  previewHint: "Temporarily enables accessibility in desktop WeChat. Previews work while WeChat is minimized and are kept for the current app session.",
  previewStatus: {
    off: "Message previews are off.",
    waiting: "Waiting for the signed-in WeChat window.",
    ready: "Connected to the WeChat chat list.",
    tray: "WeChat is in the system tray. Basic reminders are still available.",
    unsupported: "This WeChat version cannot provide previews. Basic reminders are still available.",
    unavailable: "The chat list is currently unavailable. Basic reminders are still available.",
  },
  status: {
    disabled: "Paused",
    waiting: "Connecting",
    listening: "Connected",
    error: "Connection failed, retrying",
  },
};
