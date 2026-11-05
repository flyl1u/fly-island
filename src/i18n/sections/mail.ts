export type MailText = {
  savePreferencesFailed: string;
  desktopConnect: string;
  desktopRead: string;
  changed: string;
  openLinkFailed: string;
  openFailed: string;
  helpFailed: string;
  reader: string;
  back: string;
  webHint: string;
  openWeb: string;
  body: string;
  loading: string;
  emptyHtml: string;
  emptyText: string;
  notice: string;
  remoteImages: string;
  remoteImagesOn: string;
  remoteImagesOff: string;
  loadRemoteImages: string;
  remoteImagesBlocked: (count: number) => string;
  receive: string;
  pause: string;
  resume: string;
  help: string;
  helpLabel: string;
  open: string;
  openLabel: string;
  refresh: string;
  refreshLabel: string;
  disconnect: string;
  disconnectLabel: string;
  email: string;
  emailPlaceholder: string;
  authorizationCode: string;
  authorizationPlaceholder: string;
  connect: string;
  inbox: string;
  syncing: string;
  empty: string;
  status: {
    disconnected: string;
    connecting: string;
    connected: string;
    paused: string;
    authRequired: string;
    error: string;
  };
  lastSynced: (time: string) => string;
  readMessage: (subject: string, unread: boolean) => string;
};

export const zhCN: MailText = {
  savePreferencesFailed: "无法保存邮箱连接偏好，下次启动可能需要重新连接。",
  desktopConnect: "请在 Windows 桌面版中连接 QQ 邮箱。",
  desktopRead: "请在 Windows 桌面版中阅读邮件。",
  changed: "邮件内容已改变，请重试。",
  openLinkFailed: "无法打开链接，请检查默认浏览器。",
  openFailed: "无法打开 QQ 邮箱，请检查默认浏览器。",
  helpFailed: "无法打开邮箱帮助，请在 QQ 邮箱设置中查找 IMAP 和授权码。",
  reader: "邮件阅读",
  back: "返回列表",
  webHint: "附件和回复请在网页中处理",
  openWeb: "在网页打开",
  body: "邮件正文",
  loading: "正在加载正文",
  emptyHtml: "这封邮件没有可显示的文字，请在网页中查看。",
  emptyText: "这封邮件没有文字正文。",
  notice: "仅预览，不自动标为已读 · 附件请在网页查看",
  remoteImages: "远程图片",
  remoteImagesOn: "已允许加载远程图片，点击关闭",
  remoteImagesOff: "远程图片已阻止，点击显示",
  loadRemoteImages: "显示图片",
  remoteImagesBlocked: (count: number) => `已阻止 ${count} 张远程图片`,
  receive: "接收 QQ 邮箱",
  pause: "暂停接收邮件",
  resume: "接收邮件",
  help: "开启 IMAP / 获取授权码",
  helpLabel: "查看 IMAP 和邮箱授权码帮助",
  open: "打开邮箱",
  openLabel: "打开 QQ 邮箱",
  refresh: "刷新邮件",
  refreshLabel: "刷新 QQ 邮箱",
  disconnect: "断开并删除授权码",
  disconnectLabel: "断开 QQ 邮箱并删除保存的授权码",
  email: "QQ 邮箱地址",
  emailPlaceholder: "邮箱地址@qq.com",
  authorizationCode: "QQ 邮箱授权码",
  authorizationPlaceholder: "邮箱授权码",
  connect: "连接",
  inbox: "收件箱最近 20 封邮件",
  syncing: "同步中",
  empty: "暂无邮件",
  status: {
    disconnected: "未连接",
    connecting: "连接中",
    connected: "已连接",
    paused: "已暂停",
    authRequired: "需要重新授权",
    error: "同步失败",
  },
  lastSynced: (time) => `刷新邮件 · 上次同步 ${time}`,
  readMessage: (subject, unread) => `阅读邮件：${subject}${unread ? "，未读" : ""}`,
};

export const en: MailText = {
  savePreferencesFailed: "Could not save mail preferences. You may need to reconnect next time.",
  desktopConnect: "Use the Windows desktop app to connect QQ Mail.",
  desktopRead: "Use the Windows desktop app to read mail.",
  changed: "The email changed. Please try again.",
  openLinkFailed: "Could not open the link. Check your default browser.",
  openFailed: "Could not open QQ Mail. Check your default browser.",
  helpFailed: "Could not open mail help. Find IMAP and authorization codes in QQ Mail settings.",
  reader: "Mail reader",
  back: "Back to list",
  webHint: "Open the website for attachments and replies",
  openWeb: "Open in browser",
  body: "Email body",
  loading: "Loading email",
  emptyHtml: "No text to display. View this email in your browser.",
  emptyText: "This email has no text body.",
  notice: "Preview only, stays unread · View attachments in your browser",
  remoteImages: "Remote images",
  remoteImagesOn: "Remote images allowed, click to block",
  remoteImagesOff: "Remote images blocked, click to show",
  loadRemoteImages: "Show images",
  remoteImagesBlocked: (count: number) => `${count} remote image${count === 1 ? "" : "s"} blocked`,
  receive: "Receive QQ Mail",
  pause: "Pause mail notifications",
  resume: "Receive mail notifications",
  help: "Enable IMAP / get an authorization code",
  helpLabel: "Help with IMAP and mail authorization codes",
  open: "Open mail",
  openLabel: "Open QQ Mail",
  refresh: "Refresh mail",
  refreshLabel: "Refresh QQ Mail",
  disconnect: "Disconnect and remove authorization code",
  disconnectLabel: "Disconnect QQ Mail and remove the saved authorization code",
  email: "QQ email address",
  emailPlaceholder: "address@qq.com",
  authorizationCode: "QQ Mail authorization code",
  authorizationPlaceholder: "Mail authorization code",
  connect: "Connect",
  inbox: "Latest 20 inbox messages",
  syncing: "Syncing",
  empty: "No mail",
  status: {
    disconnected: "Disconnected",
    connecting: "Connecting",
    connected: "Connected",
    paused: "Paused",
    authRequired: "Authorization required",
    error: "Sync failed",
  },
  lastSynced: (time) => `Refresh mail · Last synced ${time}`,
  readMessage: (subject, unread) => `Read email: ${subject}${unread ? ", unread" : ""}`,
};
