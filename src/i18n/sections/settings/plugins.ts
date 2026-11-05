export type SettingsPluginsText = {
  allowThirdParty: string;
  warning: string;
  folder: string;
  openFolder: string;
  reload: string;
  empty: string;
  enable: string;
  by: (author: string) => string;
  homepage: string;
  permissions: string;
  noPermissions: string;
  permissionCount: (count: number) => string;
  permission: Record<"todos:read" | "todos:write" | "notes:read" | "notes:write" | "agent-status:read" | "agent-status:write" | "island:notify" | "secrets" | "clipboard:read" | "messages:read" | "media:read" | "media:control" | "shelf:read" | "shelf:write", string>;
  needsApproval: string;
  keybindingConflict: (shortcuts: string) => string;
  /** Sensitive permissions: the island asks before the first use. */
  sensitive: {
    prompt: (plugin: string, action: string) => string;
    allow: string;
    once: string;
    deny: string;
    action: Record<"clipboard:read" | "messages:read" | "media:read" | "shelf:read" | "shelf:write" | "uri", string>;
    title: string;
    hint: string;
    allowed: string;
    denied: string;
    revoke: string;
    none: string;
  };
  notAllowed: string;
  describedOnly: string;
  invalid: string;
  log: string;
  noLog: string;
  status: Record<"stopped" | "starting" | "running" | "restarting" | "crashed" | "idle", string>;
  /** How a plugin runs: on demand, memory, CPU, start-up time (P9). */
  run: {
    onDemand: string;
    memory: (megabytes: string) => string;
    memorySplit: (total: string, runtime: string, runtimeMegabytes: string, pluginMegabytes: string) => string;
    cpu: (percent: string) => string;
    cpuIdle: string;
    processLine: (name: string, commitMegabytes: string, workingSetMegabytes: string) => string;
    runtimeHelp: (runtime: string, megabytes: string) => string;
    memoryHelp: string;
    startup: (milliseconds: number) => string;
    highCpu: string;
    keepAlive: (reason: string) => string;
  };
  /** Settings > Plugins > Developer: development mode (P10). */
  dev: {
    title: string;
    badge: string;
    mode: string;
    modeHint: string;
    path: string;
    pathPlaceholder: string;
    load: string;
    reload: string;
    unload: string;
    noPlugins: string;
    inspect: string;
    trace: (id: string) => string;
    traceEmpty: string;
    event: string;
    payload: string;
    send: string;
    badJson: string;
  };
  uninstall: string;
  confirmUninstall: string;
  builtin: string;
  runtimeBuiltIn: string;
  runtimeNode: string;
  nodeMissing: string;
  getNode: string;
  detail: {
    open: string;
    back: string;
    info: string;
    infoWhenRunning: string;
    settings: string;
    noSettings: string;
    actions: string;
    copy: string;
    copied: string;
    show: string;
    hide: string;
    notifications: string;
    showNotifications: string;
    memoryLimit: string;
    memoryLimitOption: (megabytes: number) => string;
    memoryLimitHint: string;
    data: string;
    dataHint: string;
    clearData: string;
    confirmClearData: string;
  };
  market: {
    title: string;
    hint: string;
    refresh: string;
    loading: string;
    empty: string;
    loadFailed: string;
    installFailed: (name: string) => string;
    install: string;
    installing: string;
    update: (version: string) => string;
    installed: string;
    incompatible: string;
    /** Search, categories, publishers and details (P11). */
    search: string;
    noMatches: string;
    allCategories: string;
    category: Record<"productivity" | "todos" | "developer" | "media" | "messages" | "information" | "utilities", string>;
    official: string;
    publisher: (name: string) => string;
    trustAndInstall: string;
    trustHint: (publisher: string) => string;
    revoked: string;
    details: string;
    hideDetails: string;
    repository: string;
    reportIssue: string;
    readme: string;
    changelog: string;
    customUi: string;
    customUiHint: string;
  };
  /** Plugin updates and trusted publishers on the plugins page (P11). */
  updates: {
    title: string;
    autoUpdate: string;
    autoUpdateHint: string;
    check: string;
    trusted: string;
    noTrusted: string;
    untrust: string;
    available: (version: string) => string;
    autoUpdated: (version: string) => string;
    revoked: (reason: string) => string;
    preReleaseTitle: string;
    preRelease: string;
    preReleaseHint: string;
    preReleaseAvailable: (version: string) => string;
    preReleaseOffered: (version: string) => string;
  };
};

export const zhCN: SettingsPluginsText = {
  allowThirdParty: "允许运行第三方插件",
  warning: "插件是在你电脑上运行的程序，和你本人有同样的权限：可以读写文件、联网，也能读到这台电脑上保存的密码和授权码（包括岛屿保存的邮箱授权码和翻译密钥）。下面列出的权限只限制它能通过岛屿读写哪些数据。只安装你信任的插件。",
  folder: "插件目录",
  openFolder: "打开",
  reload: "重新加载",
  empty: "还没有安装插件。把插件文件夹放进插件目录，再点“重新加载”。",
  enable: "启用",
  by: (author: string) => `作者：${author}`,
  homepage: "主页",
  permissions: "需要的权限",
  noPermissions: "不需要读写岛上的数据",
  permissionCount: (count: number) => `${count} 项权限`,
  permission: {
    "todos:read": "读取待办",
    "todos:write": "添加、修改和删除待办",
    "notes:read": "读取每日笔记",
    "notes:write": "修改每日笔记",
    "agent-status:read": "读取 AI Agent 状态",
    "agent-status:write": "在状态灯上显示 AI Agent 状态",
    "island:notify": "在岛上显示通知",
    secrets: "在 Windows 凭据管理器中保存密码和令牌",
    "clipboard:read": "读取剪贴板历史中的文字（敏感，首次使用时询问）",
    "messages:read": "读取 QQ、微信和邮箱的提醒：发送者和预览文字，不含邮件正文（敏感）",
    "media:read": "读取正在播放的歌曲和播放器（敏感）",
    "media:control": "播放、暂停、上一首、下一首",
    "shelf:read": "读取文件中转列表（只有路径，敏感）",
    "shelf:write": "往文件中转添加或移除条目，不会删除文件（敏感）",
  },
  needsApproval: "新版本需要更多权限，已暂停。关掉再打开开关即可授权。",
  keybindingConflict: (shortcuts: string) => `快捷键已被其他程序占用：${shortcuts}`,
  sensitive: {
    prompt: (plugin: string, action: string) => `${plugin} 想${action}`,
    allow: "允许",
    once: "本次",
    deny: "拒绝",
    action: {
      "clipboard:read": "读取剪贴板历史",
      "messages:read": "读取消息提醒",
      "media:read": "读取正在播放的内容",
      "shelf:read": "读取文件中转列表",
      "shelf:write": "修改文件中转列表",
      uri: "处理网页或其他程序打开的 focusd:// 链接",
    },
    title: "敏感权限",
    hint: "插件第一次使用这些权限或收到链接时，岛上会询问你。撤销后，下次使用会再问一次。",
    allowed: "已允许",
    denied: "已拒绝",
    revoke: "撤销",
    none: "还没有询问过。",
  },
  notAllowed: "先在上面打开“允许运行第三方插件”。",
  describedOnly: "这个插件没有需要运行的程序。",
  invalid: "无法加载",
  log: "日志",
  noLog: "暂无日志",
  status: {
    stopped: "未运行",
    starting: "启动中",
    running: "运行中",
    restarting: "重启中",
    crashed: "已出错停止",
    idle: "待命",
  },
  run: {
    onDemand: "按需启动：用到时才运行，空闲 1 分钟后自动停止。",
    memory: (megabytes: string) => `内存 ${megabytes} MB`,
    memorySplit: (total, runtime, runtimeMegabytes, pluginMegabytes) => `内存 ${total} MB（${runtime} ${runtimeMegabytes} MB + 插件 ${pluginMegabytes} MB）`,
    cpu: (percent: string) => `CPU ${percent}%`,
    cpuIdle: "CPU 空闲",
    processLine: (name, commitMegabytes, workingSetMegabytes) => `${name}：已提交 ${commitMegabytes} MB，工作集 ${workingSetMegabytes} MB`,
    runtimeHelp: (runtime, megabytes) => `${runtime} ${megabytes} MB 是什么都不做的 ${runtime} 本身的占用，每个用 ${runtime} 运行的插件都有这一份；插件自己的代码只占剩下的部分。`,
    memoryHelp: "内存按「已提交」计算：只属于这个插件的进程、不和别的程序共享的内存，对应任务管理器「详细信息」里的「提交大小」。任务管理器默认的「内存」列是私有工作集，数字会不一样。",
    startup: (milliseconds: number) => `启动 ${milliseconds} ms`,
    highCpu: "这个插件过去 1 分钟一直占用较多 CPU。",
    keepAlive: (reason: string) => `插件申请常驻：${reason}`,
  },
  dev: {
    title: "开发者",
    badge: "开发中",
    mode: "开发模式",
    modeHint: "可以加载任意文件夹里的插件来调试：不需要打开“允许第三方插件”，自动获得它申请的权限（敏感权限仍会询问），也可以使用实验 API。开发模式不保存，岛屿重启后要重新打开。命令行工具 fly-island-plugin dev 还需要打开“本地 API”插件。",
    path: "插件文件夹",
    pathPlaceholder: "插件文件夹的完整路径，里面要有 focusd-plugin.json",
    load: "加载",
    reload: "重新加载",
    unload: "移除",
    noPlugins: "还没有加载开发中的插件。",
    inspect: "查看收发记录",
    trace: (id: string) => `${id} 的 JSON-RPC 收发记录（最近 200 行）`,
    traceEmpty: "还没有收发记录。插件运行后会显示在这里。",
    event: "事件",
    payload: "事件内容（JSON）",
    send: "发送事件",
    badJson: "事件内容不是有效的 JSON。",
  },
  uninstall: "卸载",
  confirmUninstall: "确认卸载",
  builtin: "内置",
  runtimeBuiltIn: "无需另外安装",
  runtimeNode: "需要 Node.js",
  nodeMissing: "这台电脑上没有找到 Node.js，装好之后这个插件才能运行。",
  getNode: "下载 Node.js",
  detail: {
    open: "设置",
    back: "返回插件列表",
    info: "运行信息",
    infoWhenRunning: "插件运行后，会在这里显示它提供的信息。",
    settings: "设置",
    noSettings: "这个插件没有可以调整的设置。",
    actions: "操作",
    copy: "复制",
    copied: "已复制",
    show: "显示",
    hide: "隐藏",
    notifications: "通知",
    showNotifications: "在岛上显示这个插件的通知",
    memoryLimit: "内存上限",
    memoryLimitOption: (megabytes: number) => (megabytes >= 1024 ? `${megabytes / 1024} GB` : `${megabytes} MB`) + (megabytes === 512 ? "（默认）" : ""),
    memoryLimitHint: "插件（连同它启动的程序）占用的已提交内存超过上限时，岛屿会结束它并显示原因。一般不需要改；插件说明里要求更多内存时再调高。",
    data: "数据",
    dataHint: "删除插件保存的数据和凭据，插件会重新启动。卸载插件不会删除这些数据。",
    clearData: "清除数据",
    confirmClearData: "确认清除",
  },
  market: {
    title: "插件市场",
    hint: "从这里安装的插件会先核对校验值，确认文件完整、没被改动过。装好后默认是关闭的，打开时再决定给它哪些权限。",
    refresh: "刷新",
    loading: "正在加载插件列表…",
    empty: "市场里暂时还没有插件。",
    loadFailed: "暂时获取不到插件列表。请检查网络或 Windows 系统代理，然后点「刷新」重试。",
    installFailed: (name: string) => `「${name}」没有装上，已有的插件不受影响。`,
    install: "安装",
    installing: "正在安装…",
    update: (version: string) => `更新到 v${version}`,
    installed: "已安装",
    incompatible: "不兼容",
    search: "搜索名称、说明或发布者",
    noMatches: "没有符合条件的插件。",
    allCategories: "全部",
    category: {
      productivity: "效率",
      todos: "待办",
      developer: "开发",
      media: "媒体",
      messages: "消息",
      information: "资讯",
      utilities: "工具",
    },
    official: "官方",
    publisher: (name: string) => `发布者 ${name}`,
    trustAndInstall: "信任并安装",
    trustHint: (publisher: string) => `第一次安装 ${publisher} 发布的插件，需要先信任这个发布者。插件以你的身份运行，能访问你能访问的文件和保存的密码，只信任你了解的发布者。信任后它的插件可以安装和自动更新，可在 插件扩展 → 更新 中取消。`,
    revoked: "已下架",
    details: "详情",
    hideDetails: "收起",
    repository: "源码仓库",
    reportIssue: "报告问题",
    readme: "插件说明",
    changelog: "版本历史",
    customUi: "自定义界面",
    customUiHint: "这个插件在岛上显示自己写的网页。网页只能和插件自己通信，不能联网，也调用不了岛屿的功能。",
  },
  updates: {
    title: "更新",
    autoUpdate: "自动更新插件",
    autoUpdateHint: "岛屿每 6 小时在后台检查一次插件市场（只在允许第三方插件时）。打开后，不需要新权限、发布者已受信任的更新会自动安装；需要新权限的更新始终只提示。",
    check: "立即检查",
    trusted: "受信任的发布者",
    noTrusted: "还没有信任其他发布者（官方插件总是受信任）。",
    untrust: "取消信任",
    available: (version: string) => `有新版本 v${version}，可在插件市场更新。`,
    autoUpdated: (version: string) => `已自动更新到 v${version}。`,
    revoked: (reason: string) => `这个版本已从插件市场下架，已停用：${reason}`,
    preReleaseTitle: "预发布版本",
    preRelease: "接收这个插件的预发布版本",
    preReleaseHint: "预发布版本是作者还在测试的新版本，可能不稳定。关掉后不会退回旧版本，等正式版比当前版本新时再更新。",
    preReleaseAvailable: (version: string) => `插件市场里有预发布版本 v${version}。`,
    preReleaseOffered: (version: string) => `有预发布版本 v${version}，可在插件设置里选择接收。`,
  },
};

export const en: SettingsPluginsText = {
  allowThirdParty: "Allow third-party plugins",
  warning: "Plugins are programs that run on your computer with the same rights as you: they can read and write files, use the network, and read passwords and codes saved on this computer (including the mail codes and translation keys the island saves). The permissions below only limit which data they can use through the island. Only install plugins you trust.",
  folder: "Plugins folder",
  openFolder: "Open",
  reload: "Reload",
  empty: "No plugins installed. Put a plugin folder in the plugins folder, then click Reload.",
  enable: "Enabled",
  by: (author: string) => `by ${author}`,
  homepage: "Homepage",
  permissions: "Permissions",
  noPermissions: "Uses no island data",
  permissionCount: (count: number) => (count === 1 ? "1 permission" : `${count} permissions`),
  permission: {
    "todos:read": "Read todos",
    "todos:write": "Add, change and delete todos",
    "notes:read": "Read the daily note",
    "notes:write": "Change the daily note",
    "agent-status:read": "Read AI Agent status",
    "agent-status:write": "Show AI Agent status on the light",
    "island:notify": "Show notifications on the island",
    secrets: "Keep passwords and tokens in Windows Credential Manager",
    "clipboard:read": "Read text from the clipboard history (sensitive: asks on first use)",
    "messages:read": "Read QQ, WeChat and mail alerts: sender and preview, never mail bodies (sensitive)",
    "media:read": "See what is playing and in which player (sensitive)",
    "media:control": "Play, pause, next and previous track",
    "shelf:read": "Read the file shelf (paths only; sensitive)",
    "shelf:write": "Add to or remove from the file shelf; never deletes files (sensitive)",
  },
  needsApproval: "The new version asks for more permissions, so it is paused. Switch it off and on to allow them.",
  keybindingConflict: (shortcuts: string) => `Shortcut already in use by another app: ${shortcuts}`,
  sensitive: {
    prompt: (plugin: string, action: string) => `${plugin} wants to ${action}`,
    allow: "Allow",
    once: "Once",
    deny: "Deny",
    action: {
      "clipboard:read": "read your clipboard history",
      "messages:read": "read your message alerts",
      "media:read": "see what is playing",
      "shelf:read": "read the file shelf",
      "shelf:write": "change the file shelf",
      uri: "handle a focusd:// link opened by a web page or another app",
    },
    title: "Sensitive permissions",
    hint: "The island asks you the first time a plugin uses one of these or receives a link. After you revoke an answer, it asks again.",
    allowed: "Allowed",
    denied: "Denied",
    revoke: "Revoke",
    none: "Not asked yet.",
  },
  notAllowed: "Turn on “Allow third-party plugins” above first.",
  describedOnly: "This plugin has nothing to run.",
  invalid: "Cannot load",
  log: "Log",
  noLog: "No log yet",
  status: {
    stopped: "Not running",
    starting: "Starting",
    running: "Running",
    restarting: "Restarting",
    crashed: "Stopped after errors",
    idle: "Idle",
  },
  run: {
    onDemand: "Starts on demand: runs only when needed and stops after a minute with nothing to do.",
    memory: (megabytes: string) => `Memory ${megabytes} MB`,
    memorySplit: (total, runtime, runtimeMegabytes, pluginMegabytes) => `Memory ${total} MB (${runtime} ${runtimeMegabytes} MB + plugin ${pluginMegabytes} MB)`,
    cpu: (percent: string) => `CPU ${percent}%`,
    cpuIdle: "CPU idle",
    processLine: (name, commitMegabytes, workingSetMegabytes) => `${name}: ${commitMegabytes} MB committed, ${workingSetMegabytes} MB working set`,
    runtimeHelp: (runtime, megabytes) => `${runtime} ${megabytes} MB is what an idle ${runtime} takes by itself; every plugin that runs on ${runtime} has this share, and the plugin's own code uses the rest.`,
    memoryHelp: "Memory is the committed (private) memory of the plugin's processes, not shared with other programs: the Commit size column in Task Manager's Details tab. Task Manager's default Memory column is the private working set, so its numbers differ.",
    startup: (milliseconds: number) => `Started in ${milliseconds} ms`,
    highCpu: "This plugin has used a lot of CPU for the last minute.",
    keepAlive: (reason: string) => `Keeps running: ${reason}`,
  },
  dev: {
    title: "Developer",
    badge: "In development",
    mode: "Development mode",
    modeHint: "Load a plugin from any folder to debug it: it needs no “Allow third-party plugins”, gets the permissions it asks for (sensitive ones are still confirmed) and may use experimental APIs. Development mode is not saved; turn it on again after the island restarts. The fly-island-plugin dev command also needs the Local API plugin on.",
    path: "Plugin folder",
    pathPlaceholder: "Full path of a folder with focusd-plugin.json",
    load: "Load",
    reload: "Reload",
    unload: "Remove",
    noPlugins: "No plugins in development loaded yet.",
    inspect: "Show its messages",
    trace: (id: string) => `JSON-RPC messages of ${id} (last 200 lines)`,
    traceEmpty: "No messages yet. They show up here once the plugin runs.",
    event: "Event",
    payload: "Event payload (JSON)",
    send: "Send event",
    badJson: "The payload is not valid JSON.",
  },
  uninstall: "Uninstall",
  confirmUninstall: "Confirm uninstall",
  builtin: "Built in",
  runtimeBuiltIn: "Nothing else to install",
  runtimeNode: "Needs Node.js",
  nodeMissing: "Node.js was not found on this computer; this plugin runs once it is installed.",
  getNode: "Get Node.js",
  detail: {
    open: "Settings",
    back: "Back to plugins",
    info: "Info",
    infoWhenRunning: "Once the plugin runs, what it shares appears here.",
    settings: "Settings",
    noSettings: "This plugin has no settings.",
    actions: "Actions",
    copy: "Copy",
    copied: "Copied",
    show: "Show",
    hide: "Hide",
    notifications: "Notifications",
    showNotifications: "Show this plugin's notifications on the island",
    memoryLimit: "Memory limit",
    memoryLimitOption: (megabytes: number) => (megabytes >= 1024 ? `${megabytes / 1024} GB` : `${megabytes} MB`) + (megabytes === 512 ? " (default)" : ""),
    memoryLimitHint: "When the plugin, with the programs it starts, commits more memory than this, the island stops it and says why. Leave it unless the plugin's description asks for more.",
    data: "Data",
    dataHint: "Deletes what the plugin saved, including its secrets, and restarts it. Uninstalling keeps this data.",
    clearData: "Clear data",
    confirmClearData: "Confirm clear",
  },
  market: {
    title: "Plugin market",
    hint: "Plugins installed from here are checked first to make sure the files are complete and unchanged. They start off, and you choose what they may access when you turn one on.",
    refresh: "Refresh",
    loading: "Loading plugins…",
    empty: "No plugins in the market yet.",
    loadFailed: "Could not load the plugin list. Check your network or the Windows proxy settings, then click Refresh.",
    installFailed: (name: string) => `${name} was not installed. Your other plugins are unaffected.`,
    install: "Install",
    installing: "Installing…",
    update: (version: string) => `Update to v${version}`,
    installed: "Installed",
    incompatible: "Not compatible",
    search: "Search names, descriptions or publishers",
    noMatches: "No plugins match.",
    allCategories: "All",
    category: {
      productivity: "Productivity",
      todos: "Todos",
      developer: "Developer",
      media: "Media",
      messages: "Messages",
      information: "Information",
      utilities: "Utilities",
    },
    official: "Official",
    publisher: (name: string) => `Published by ${name}`,
    trustAndInstall: "Trust and install",
    trustHint: (publisher: string) => `This is the first plugin from ${publisher}. Trust the publisher to install it. Plugins run as you and can reach your files and saved passwords, so only trust publishers you know. Its plugins can then be installed and updated automatically. You can undo this under Plugins > Updates.`,
    revoked: "Taken down",
    details: "Details",
    hideDetails: "Less",
    repository: "Source code",
    reportIssue: "Report a problem",
    readme: "About this plugin",
    changelog: "Version history",
    customUi: "Custom UI",
    customUiHint: "This plugin shows its own web page on the island. The page can only talk to the plugin, cannot go online and cannot use the island's features.",
  },
  updates: {
    title: "Updates",
    autoUpdate: "Update plugins automatically",
    autoUpdateHint: "The island checks the plugin market every 6 hours in the background (only while third-party plugins are allowed). When this is on, updates from trusted publishers that need no new permissions install by themselves; updates that need more permissions are only offered.",
    check: "Check now",
    trusted: "Trusted publishers",
    noTrusted: "No other publishers trusted yet (official plugins always are).",
    untrust: "Stop trusting",
    available: (version: string) => `Version ${version} is available in the plugin market.`,
    autoUpdated: (version: string) => `Updated to ${version} automatically.`,
    revoked: (reason: string) => `This version was taken off the plugin market and is switched off: ${reason}`,
    preReleaseTitle: "Pre-releases",
    preRelease: "Get pre-releases of this plugin",
    preReleaseHint: "Pre-releases are new versions the author is still testing and may be unstable. Turning this off does not roll back; the plugin updates again once a release is newer than what is installed.",
    preReleaseAvailable: (version: string) => `Pre-release ${version} is in the plugin market. `,
    preReleaseOffered: (version: string) => `Pre-release ${version} is available; you can opt in from the plugin's settings.`,
  },
};
