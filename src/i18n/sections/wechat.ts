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
  jumpUnavailable: string;
  showPreview: string;
  previewHint: string;
  previewRisk: string;
  hideMinimizedTaskbar: string;
  hideMinimizedTaskbarHint: string;
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
  openFrom: (contact) => `打开微信中的「${contact}」会话`,
  jumpUnavailable: "已打开微信，未能定位该会话。请在微信聊天列表中打开。",
  showPreview: "显示联系人和消息摘要",
  previewHint: "将微信留在「聊天」页。点右上角「×」收起后仍可收到摘要，摘要只保存在本机内存中。",
  previewRisk: "这是非官方功能，会临时修改微信进程中的辅助功能标志，可能导致客户端异常、升级后失效或触发微信账号限制。",
  hideMinimizedTaskbar: "最小化时隐藏微信任务栏图标",
  hideMinimizedTaskbarHint: "用「−」最小化微信后隐藏任务栏图标，同时保留消息摘要。",
  previewStatus: {
    off: "消息摘要已关闭。",
    waiting: "等待已登录的微信主窗口。",
    ready: "已连接微信会话列表。",
    tray: "微信已在系统托盘中。重新打开一次微信可恢复摘要。",
    unsupported: "当前微信版本无法启用摘要，仍可接收普通提醒。",
    unavailable: "暂时读不到会话列表。请在微信切到「聊天」页后最小化，普通提醒仍可接收。",
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
  openFrom: (contact) => `Open the conversation with ${contact} in WeChat`,
  jumpUnavailable: "WeChat opened. Find the conversation in its chat list.",
  showPreview: "Show contacts and message previews",
  previewHint: "Leave WeChat on Chats. Previews remain available after you click Close (×) and are kept in memory on this device.",
  previewRisk: "This unofficial feature temporarily changes an accessibility flag in the WeChat process. It may affect client stability, stop working after an update, or trigger WeChat account restrictions.",
  hideMinimizedTaskbar: "Hide the WeChat taskbar button when minimized",
  hideMinimizedTaskbarHint: "Click Minimize (−) in WeChat to hide its taskbar button and keep message previews available.",
  previewStatus: {
    off: "Message previews are off.",
    waiting: "Waiting for the signed-in WeChat window.",
    ready: "Connected to the WeChat chat list.",
    tray: "WeChat is in the system tray. Open WeChat once to resume previews.",
    unsupported: "This WeChat version cannot provide previews. Basic reminders are still available.",
    unavailable: "The chat list is unavailable. Switch WeChat to Chats, then minimize it. Basic reminders are still available.",
  },
  status: {
    disabled: "Paused",
    waiting: "Connecting",
    listening: "Connected",
    error: "Connection failed, retrying",
  },
};
