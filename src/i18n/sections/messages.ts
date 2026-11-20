export type MessagesText = {
  title: string;
  sources: string;
  wechat: string;
  mail: string;
  qqMail: string;
  qqNotifications: string;
  wechatReminders: string;
  newReminder: string;
  yesterday: string;
  clearAll: string;
  markAllRead: string;
  markAllReadFailed: string;
  newMessage: string;
  newMail: string;
  wechatPreview: string;
  newMailLabel: string;
  sourceLabels: {
    qq: string;
    wechat: string;
    qqMail: string;
    plugin: string;
    dingtalk: string;
    feishu: string;
    wecom: string;
  };
  office: {
    receive: (name: string) => string;
    reminders: (name: string) => string;
    open: (name: string) => string;
    noReminders: string;
    clickToOpen: string;
    status: { disabled: string; listening: string; error: string };
  };
  reorderHint: string;
  collapsedTask: (title: string) => string;
  expand: (label: string) => string;
  openPreview: (text: string, source: string) => string;
  noticeOpen: (source: string) => string;
  noticeReader: (sender: string) => string;
  /** `office`: the name of an office client (DingTalk…) with a new reminder, if any. */
  badge: (count: number, wechat: boolean, office?: string | null) => string;
  label: (text: string) => string;
  qqPreview: (title: string, body: string) => string;
};

export const zhCN: MessagesText = {
  title: "消息",
  sources: "消息来源",
  wechat: "微信",
  mail: "邮箱",
  qqMail: "邮箱",
  qqNotifications: "QQ 通知",
  wechatReminders: "微信提醒",
  newReminder: "有新提醒",
  yesterday: "昨天",
  clearAll: "全部已读并清空",
  markAllRead: "全部标为已读",
  markAllReadFailed: "部分邮件未能标为已读，请重试。",
  newMessage: "收到一条新消息",
  newMail: "收到一封新邮件",
  wechatPreview: "你收到了一条消息",
  newMailLabel: "邮箱有新邮件，查看邮件",
  sourceLabels: {
    qq: "QQ",
    wechat: "微信",
    qqMail: "邮箱",
    plugin: "插件",
    dingtalk: "钉钉",
    feishu: "飞书",
    wecom: "企业微信",
  },
  office: {
    receive: (name) => `接收${name}提醒`,
    reminders: (name) => `${name}提醒`,
    open: (name) => `打开${name}`,
    noReminders: "暂无新提醒",
    clickToOpen: "点击打开",
    status: { disabled: "已关闭", listening: "暂无新提醒", error: "无法监听" },
  },
  reorderHint: "长按拖动可调整顺序",
  collapsedTask: (title) => `待办：${title}`,
  expand: (label) => `${label}，点击展开`,
  openPreview: (text, source) => `${text}，点击打开${source}`,
  noticeOpen: (source) => `打开${source}`,
  noticeReader: (sender) => `${sender} 的消息全文`,
  badge: (count, wechat, office) => `QQ ${count} 条通知${wechat ? "，微信有新提醒" : ""}${office ? `，${office}有新提醒` : ""}`,
  label: (text) => `消息：${text}`,
  qqPreview: (title, body) => `${title}：${body}`,
};

export const en: MessagesText = {
  title: "Messages",
  sources: "Message sources",
  wechat: "WeChat",
  mail: "Mail",
  qqMail: "Mail",
  qqNotifications: "QQ notifications",
  wechatReminders: "WeChat reminders",
  newReminder: "New reminder",
  yesterday: "Yesterday",
  clearAll: "Mark all read and clear",
  markAllRead: "Mark all read",
  markAllReadFailed: "Some messages could not be marked read. Try again.",
  newMessage: "New message",
  newMail: "New email",
  wechatPreview: "You received a message",
  newMailLabel: "New email, view mail",
  sourceLabels: {
    qq: "QQ",
    wechat: "WeChat",
    qqMail: "Mail",
    plugin: "Plugin",
    dingtalk: "DingTalk",
    feishu: "Feishu",
    wecom: "WeCom",
  },
  office: {
    receive: (name) => `Receive ${name} reminders`,
    reminders: (name) => `${name} reminders`,
    open: (name) => `Open ${name}`,
    noReminders: "No new reminders",
    clickToOpen: "Click to open",
    status: { disabled: "Off", listening: "No new reminders", error: "Can't listen" },
  },
  reorderHint: "Press and hold to drag into a new order",
  collapsedTask: (title) => `Task: ${title}`,
  expand: (label) => `${label}, click to expand`,
  openPreview: (text, source) => `${text}, click to open ${source}`,
  noticeOpen: (source) => `Open ${source}`,
  noticeReader: (sender) => `Full message from ${sender}`,
  badge: (count, wechat, office) => `${count} QQ notification${count === 1 ? "" : "s"}${wechat ? ", new WeChat reminder" : ""}${office ? `, new ${office} reminder` : ""}`,
  label: (text) => `Messages: ${text}`,
  qqPreview: (title, body) => `${title}: ${body}`,
};
