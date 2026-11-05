export type MessagesText = {
  title: string;
  sources: string;
  wechat: string;
  mail: string;
  qqMail: string;
  qqNotifications: string;
  wechatReminders: string;
  newReminder: string;
  newMessage: string;
  newMail: string;
  wechatPreview: string;
  openNewMail: string;
  newMailLabel: string;
  sourceLabels: {
    qq: string;
    wechat: string;
    qqMail: string;
    plugin: string;
  };
  collapsedTask: (title: string) => string;
  expand: (label: string) => string;
  openPreview: (text: string, source: string) => string;
  badge: (count: number, wechat: boolean) => string;
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
  newMessage: "收到一条新消息",
  newMail: "收到一封新邮件",
  wechatPreview: "你收到了一条消息",
  openNewMail: "查看新邮件",
  newMailLabel: "邮箱有新邮件，查看邮件",
  sourceLabels: {
    qq: "QQ",
    wechat: "微信",
    qqMail: "邮箱",
    plugin: "插件",
  },
  collapsedTask: (title) => `待办：${title}`,
  expand: (label) => `${label}，点击展开`,
  openPreview: (text, source) => `${text}，点击打开${source}`,
  badge: (count, wechat) => `QQ ${count} 条通知${wechat ? "，微信有新提醒" : ""}`,
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
  newMessage: "New message",
  newMail: "New email",
  wechatPreview: "You received a message",
  openNewMail: "View new email",
  newMailLabel: "New email, view mail",
  sourceLabels: {
    qq: "QQ",
    wechat: "WeChat",
    qqMail: "Mail",
    plugin: "Plugin",
  },
  collapsedTask: (title) => `Task: ${title}`,
  expand: (label) => `${label}, click to expand`,
  openPreview: (text, source) => `${text}, click to open ${source}`,
  badge: (count, wechat) => `${count} QQ notification${count === 1 ? "" : "s"}${wechat ? ", new WeChat reminder" : ""}`,
  label: (text) => `Messages: ${text}`,
  qqPreview: (title, body) => `${title}: ${body}`,
};
