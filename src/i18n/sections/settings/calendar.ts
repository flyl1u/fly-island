type Service = "feishu" | "dingtalk" | "wecom" | "icloud" | "google" | "outlook" | "other";

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
  addHolidays: string;
  holidaysAdded: string;
  holidaysName: string;
  add: string;
  service: string;
  services: Record<Service, string>;
  /** Where to get the account and password, or the link, in each service. */
  steps: Record<Service, string[]>;
  name: string;
  server: string;
  username: string;
  password: string;
  link: string;
  addressOrLink: string;
  addressOrLinkPlaceholder: string;
  addButton: string;
  adding: string;
};

export const zhCN: SettingsCalendarText = {
  island: "小岛显示",
  remind: "会前倒计时",
  remindHint: "会议开始前这么久，收起的小岛显示「标题 · 10 分钟后」，有会议链接时旁边有「加入」按钮。开始后再留 5 分钟。今天的待办以时间开头（例如「15:00 周会」「9:30-10:00 站会」）也会这样倒计时，不用添加日历。",
  remindOption: (minutes) => (minutes === 0 ? "不显示" : `${minutes} 分钟`),
  showTitle: "显示会议标题",
  showTitleHint: "关掉后只显示「会议 · 10 分钟后」，共享屏幕时不会露出会议内容。",
  sources: "已添加的日历",
  noSources: "还没有日历。可以先订阅中国节假日，不用账号；工作日历在下面添加。",
  icsFrom: (host) => `订阅 · ${host}`,
  remove: (name) => `删除日历「${name}」`,
  addHolidays: "订阅中国节假日",
  holidaysAdded: "已订阅节假日",
  holidaysName: "中国节假日",
  add: "添加日历",
  service: "用的是",
  services: { feishu: "飞书", dingtalk: "钉钉", wecom: "企业微信", icloud: "iCloud", google: "Google 日历", outlook: "Outlook", other: "其他" },
  steps: {
    feishu: ["打开飞书电脑版 → 日历 → 右上角设置。", "找到「CalDAV 同步」，点生成账号和密码。", "把账号和密码复制到下面。"],
    dingtalk: ["打开钉钉（6.0.8 或更新）→ 日历 → 设置。", "打开「CalDAV 同步」，会显示账号和密码。", "把账号和密码复制到下面。"],
    wecom: ["打开企业微信电脑版 → 日程 → 设置。", "选「同步至其他日历」→ CalDAV，会显示服务器、账号和密码。", "把三项复制到下面。"],
    icloud: ["在 account.apple.com 登录 → 登录与安全 → App 专用密码，新建一个。", "账号填 Apple ID 邮箱，密码填刚生成的 App 专用密码。"],
    google: ["在电脑浏览器打开 Google 日历 → 设置 → 左侧选要显示的日历。", "在「集成日历」里复制「iCal 格式的私密地址」，粘贴到下面。"],
    outlook: ["在 outlook.com 打开设置 → 日历 → 共享日历 → 发布日历。", "选日历和「可以查看所有详细信息」，发布后复制 ICS 链接，粘贴到下面。"],
    other: ["粘贴日历服务器地址（CalDAV）或 .ics 订阅链接。", "是服务器地址时，再填账号和密码。"],
  },
  name: "名称（可不填）",
  server: "服务器地址",
  username: "账号",
  password: "密码",
  link: "订阅链接",
  addressOrLink: "地址或链接",
  addressOrLinkPlaceholder: "https://… 或 webcal://…",
  addButton: "读取并添加",
  adding: "正在读取…",
};

export const en: SettingsCalendarText = {
  island: "On the island",
  remind: "Countdown before a meeting",
  remindHint: "This long before a meeting starts, the collapsed island shows \"Title · in 10 min\", with a Join button when it has a meeting link. It stays for 5 minutes after the start. Today's todos that start with a time (\"15:00 Weekly sync\", \"9:30-10:00 Standup\") count down the same way, with no calendar added.",
  remindOption: (minutes) => (minutes === 0 ? "Off" : `${minutes} min`),
  showTitle: "Show the meeting's title",
  showTitleHint: "Off shows only \"Meeting · in 10 min\", so a shared screen does not reveal what the meeting is about.",
  sources: "Your calendars",
  noSources: "No calendar yet. Subscribe to China's holidays without an account, or add a work calendar below.",
  icsFrom: (host) => `Subscription · ${host}`,
  remove: (name) => `Delete the calendar "${name}"`,
  addHolidays: "Subscribe to China's holidays",
  holidaysAdded: "Holidays subscribed",
  holidaysName: "China holidays",
  add: "Add a calendar",
  service: "Service",
  services: { feishu: "Feishu / Lark", dingtalk: "DingTalk", wecom: "WeCom", icloud: "iCloud", google: "Google Calendar", outlook: "Outlook", other: "Other" },
  steps: {
    feishu: ["Open Feishu on your computer → Calendar → Settings at the top right.", "Find \"CalDAV sync\" and generate an account and password.", "Copy them below."],
    dingtalk: ["Open DingTalk (6.0.8 or later) → Calendar → Settings.", "Turn on \"CalDAV sync\"; it shows an account and password.", "Copy them below."],
    wecom: ["Open WeCom on your computer → Schedule → Settings.", "Choose \"Sync to other calendars\" → CalDAV; it shows a server, account and password.", "Copy all three below."],
    icloud: ["At account.apple.com → Sign-In and Security → App-Specific Passwords, create one.", "The account is your Apple ID email; the password is the app-specific one."],
    google: ["Open Google Calendar in a browser → Settings → pick the calendar on the left.", "Under \"Integrate calendar\", copy \"Secret address in iCal format\" and paste it below."],
    outlook: ["At outlook.com open Settings → Calendar → Shared calendars → Publish a calendar.", "Pick the calendar and \"Can view all details\", publish, then copy the ICS link below."],
    other: ["Paste a calendar server address (CalDAV) or an .ics subscription link.", "For a server, also fill in the account and password."],
  },
  name: "Name (optional)",
  server: "Server",
  username: "Account",
  password: "Password",
  link: "Subscription link",
  addressOrLink: "Address or link",
  addressOrLinkPlaceholder: "https://… or webcal://…",
  addButton: "Read and add",
  adding: "Reading…",
};
