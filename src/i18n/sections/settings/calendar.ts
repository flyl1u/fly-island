export type SettingsCalendarText = {
  island: string;
  remind: string;
  remindHint: string;
  remindOption: (minutes: number) => string;
  showTitle: string;
  showTitleHint: string;
  sources: string;
  noSources: string;
  icsFrom: (host: string) => string;
  remove: (name: string) => string;
  add: string;
  kind: string;
  caldav: string;
  ics: string;
  name: string;
  namePlaceholder: string;
  server: string;
  username: string;
  password: string;
  link: string;
  caldavHint: string;
  icsHint: string;
  addButton: string;
  adding: string;
};

export const zhCN: SettingsCalendarText = {
  island: "小岛显示",
  remind: "会前倒计时",
  remindHint: "会议开始前这么久，收起的小岛显示「标题 · 10 分钟后」，有会议链接时旁边有「加入」按钮。开始后再留 5 分钟。",
  remindOption: (minutes) => (minutes === 0 ? "不显示" : `${minutes} 分钟`),
  showTitle: "显示会议标题",
  showTitleHint: "关掉后只显示「会议 · 10 分钟后」，共享屏幕时不会露出会议内容。",
  sources: "日历",
  noSources: "还没有添加日历。添加后，小岛上会出现日历页，列出今天和明天的日程。",
  icsFrom: (host) => `订阅链接 · ${host}`,
  remove: (name) => `删除日历「${name}」`,
  add: "添加日历",
  kind: "方式",
  caldav: "账号密码（CalDAV）",
  ics: "订阅链接（ICS）",
  name: "名称",
  namePlaceholder: "例如：工作",
  server: "服务器地址",
  username: "账号",
  password: "密码",
  link: "订阅链接",
  caldavHint:
    "飞书：日历设置 → 第三方日历同步 → CalDAV 同步，生成账号和密码，服务器地址填 https://caldav.feishu.cn。钉钉：日历设置 → CalDAV 同步，服务器 https://calendar.dingtalk.com。企业微信：日程设置 → 同步至其他日历。iCloud：服务器 https://caldav.icloud.com，密码用 Apple ID 的 App 专用密码。密码保存在 Windows 凭据管理器里。",
  icsHint:
    "Google 日历：日历设置 → 「iCal 格式的私密地址」。Outlook：设置 → 日历 → 共享日历 → 发布日历，复制 ICS 链接。拿到链接的人都能看这个日历，所以链接保存在 Windows 凭据管理器里，界面上只显示网站。",
  addButton: "读取并添加",
  adding: "正在读取…",
};

export const en: SettingsCalendarText = {
  island: "On the island",
  remind: "Countdown before a meeting",
  remindHint: "This long before a meeting starts, the collapsed island shows \"Title · in 10 min\", with a Join button when it has a meeting link. It stays for 5 minutes after the start.",
  remindOption: (minutes) => (minutes === 0 ? "Off" : `${minutes} min`),
  showTitle: "Show the meeting's title",
  showTitleHint: "Off shows only \"Meeting · in 10 min\", so a shared screen does not reveal what the meeting is about.",
  sources: "Calendars",
  noSources: "No calendar yet. Once one is added, the island gets a calendar page with today's and tomorrow's events.",
  icsFrom: (host) => `Subscription link · ${host}`,
  remove: (name) => `Delete the calendar "${name}"`,
  add: "Add a calendar",
  kind: "Kind",
  caldav: "Account (CalDAV)",
  ics: "Subscription link (ICS)",
  name: "Name",
  namePlaceholder: "For example: Work",
  server: "Server",
  username: "Account",
  password: "Password",
  link: "Link",
  caldavHint:
    "Feishu / Lark: calendar settings → third-party calendar sync → CalDAV, which gives an account and password; the server is https://caldav.feishu.cn. DingTalk: calendar settings → CalDAV sync, server https://calendar.dingtalk.com. WeCom: schedule settings → sync to other calendars. iCloud: server https://caldav.icloud.com with an app-specific password. The password is kept in the Windows Credential Manager.",
  icsHint:
    "Google Calendar: calendar settings → \"Secret address in iCal format\". Outlook: Settings → Calendar → Shared calendars → Publish a calendar, then copy the ICS link. Anyone with the link can read the calendar, so it is kept in the Windows Credential Manager and only its site is shown.",
  addButton: "Read and add",
  adding: "Reading…",
};
