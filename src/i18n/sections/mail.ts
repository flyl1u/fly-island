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
  markRead: string;
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
  imapHost: string;
  imapHostPlaceholder: string;
  accounts: string;
  accountsTitle: string;
  accountsHint: string;
  addTitle: string;
  reauthorizeTitle: (email: string) => string;
  noMailbox: string;
  addInSettings: string;
  reauthorizeInSettings: string;
  reauthorize: string;
  pauseShort: string;
  resumeShort: string;
  disconnectShort: string;
  cancel: string;
  confirmDisconnect: string;
  confirmDisconnectHint: string;
  defaultHost: string;
  limitReached: (max: number) => string;
  unread: (count: number) => string;
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
  desktopConnect: "请在 Windows 桌面版中连接邮箱。",
  desktopRead: "请在 Windows 桌面版中阅读邮件。",
  changed: "邮件内容已改变，请重试。",
  openLinkFailed: "无法打开链接，请检查默认浏览器。",
  openFailed: "无法打开邮箱网页，请检查默认浏览器。",
  helpFailed: "无法打开邮箱帮助，请在邮箱设置中查找 IMAP 和授权码。",
  reader: "邮件阅读",
  back: "返回列表",
  webHint: "附件和回复请在网页中处理",
  openWeb: "在网页打开",
  markRead: "标为已读",
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
  receive: "接收邮箱",
  pause: "暂停接收邮件",
  resume: "接收邮件",
  help: "开启 IMAP / 获取授权码",
  helpLabel: "查看 IMAP 和邮箱授权码帮助",
  open: "打开邮箱",
  openLabel: "打开邮箱网页",
  refresh: "刷新邮件",
  refreshLabel: "刷新邮箱",
  disconnect: "断开并删除授权码",
  disconnectLabel: "断开邮箱并删除保存的授权码",
  email: "邮箱地址",
  emailPlaceholder: "QQ / 163 / 126 等邮箱地址",
  authorizationCode: "邮箱授权码",
  authorizationPlaceholder: "邮箱授权码",
  imapHost: "IMAP 服务器",
  imapHostPlaceholder: "可留空，默认 imap.域名；需要时加端口，如 :9993",
  accounts: "邮箱账户",
  accountsTitle: "邮箱账户",
  accountsHint: "每个邮箱有独立的后台连接，岛上的邮箱面板按标签切换。授权码保存在 Windows 凭据管理器，断开时一并删除。",
  addTitle: "添加邮箱",
  reauthorizeTitle: (email) => `重新授权 ${email}`,
  noMailbox: "还没有连接邮箱",
  addInSettings: "在设置中添加邮箱",
  reauthorizeInSettings: "去设置重新授权",
  reauthorize: "重新授权",
  pauseShort: "暂停",
  resumeShort: "接收",
  disconnectShort: "断开",
  cancel: "取消",
  confirmDisconnect: "确认断开",
  confirmDisconnectHint: "断开会停止接收，并从 Windows 凭据管理器删除这个邮箱的授权码。以后再连接需要重新生成授权码。",
  defaultHost: "默认服务器",
  limitReached: (max) => `最多同时连接 ${max} 个邮箱，请先断开一个再添加。`,
  unread: (count) => `${count} 封未读`,
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
  desktopConnect: "Use the Windows desktop app to connect your mailbox.",
  desktopRead: "Use the Windows desktop app to read mail.",
  changed: "The email changed. Please try again.",
  openLinkFailed: "Could not open the link. Check your default browser.",
  openFailed: "Could not open webmail. Check your default browser.",
  helpFailed: "Could not open mail help. Find IMAP and authorization codes in your mailbox settings.",
  reader: "Mail reader",
  back: "Back to list",
  webHint: "Open the website for attachments and replies",
  openWeb: "Open in browser",
  markRead: "Mark as read",
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
  receive: "Receive mail",
  pause: "Pause mail notifications",
  resume: "Receive mail notifications",
  help: "Enable IMAP / get an authorization code",
  helpLabel: "Help with IMAP and mail authorization codes",
  open: "Open mail",
  openLabel: "Open webmail",
  refresh: "Refresh mail",
  refreshLabel: "Refresh mailbox",
  disconnect: "Disconnect and remove authorization code",
  disconnectLabel: "Disconnect the mailbox and remove the saved authorization code",
  email: "Email address",
  emailPlaceholder: "QQ, 163, 126 or other address",
  authorizationCode: "Mail authorization code",
  authorizationPlaceholder: "Mail authorization code",
  imapHost: "IMAP server",
  imapHostPlaceholder: "Optional, imap.<domain>; add :port if needed",
  accounts: "Mailboxes",
  accountsTitle: "Mailboxes",
  accountsHint: "Each mailbox has its own background connection; the island's mail panel shows one tab each. Authorization codes are kept in Windows Credential Manager and removed on disconnect.",
  addTitle: "Add a mailbox",
  reauthorizeTitle: (email) => `Re-authorize ${email}`,
  noMailbox: "No mailbox connected yet",
  addInSettings: "Add a mailbox in settings",
  reauthorizeInSettings: "Re-authorize in settings",
  reauthorize: "Re-authorize",
  pauseShort: "Pause",
  resumeShort: "Receive",
  disconnectShort: "Disconnect",
  cancel: "Cancel",
  confirmDisconnect: "Disconnect",
  confirmDisconnectHint: "Disconnecting stops receiving and deletes this mailbox's authorization code from Windows Credential Manager. Connecting again needs a new code.",
  defaultHost: "Default server",
  limitReached: (max) => `Up to ${max} mailboxes can be connected. Disconnect one to add another.`,
  unread: (count) => `${count} unread`,
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
