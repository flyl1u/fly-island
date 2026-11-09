export type SettingsMessageSourcesText = {
  qqTitle: string;
  qqHint: string;
  wechatTitle: string;
  wechatHint: string;
};

export const zhCN: SettingsMessageSourcesText = {
  qqTitle: "QQ 通知",
  qqHint: "通过 Windows 通知读取 QQ 消息的标题和预览，只保留在本次运行的内存中。需要 QQ 已登录并开启系统通知。",
  wechatTitle: "微信提醒",
  wechatHint: "只监听电脑版微信在任务栏的闪烁提醒，读取不到消息内容、发送人或未读数。需要微信保持登录。",
};

export const en: SettingsMessageSourcesText = {
  qqTitle: "QQ notifications",
  qqHint: "Reads the title and preview of QQ messages from Windows notifications and keeps them in memory for this run only. QQ must be signed in with system notifications on.",
  wechatTitle: "WeChat reminders",
  wechatHint: "Only watches WeChat desktop flashing in the taskbar. Message text, senders and unread counts are not available. WeChat must stay signed in.",
};
