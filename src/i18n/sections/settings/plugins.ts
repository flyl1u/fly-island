import type { MarketPluginId } from "../../../features/plugins/native/catalog";
import type { PluginFailure } from "../../../features/plugins/errors";

import { zhCN as clockWeatherZh, en as clockWeatherEn, type ClockWeatherText } from "./clockWeather.ts";
import { zhCN as waterReminderZh, en as waterReminderEn, type WaterReminderText } from "./waterReminder.ts";

export type SettingsPluginsText = {
  clockWeather: ClockWeatherText;
  waterReminder: WaterReminderText;
  empty: string; installed: string; available: string; install: string; update: string;
  uninstall: string; enabled: string; permissions: string; retry: string; save: string;
  developer: string; developerMode: string; develop: string; unavailable: string; index: string; directory: string; load: string; secret: string;
  status: Record<string, string>; permission: Record<string, string>;
  guide: string; checkUpdate: string;
  guideHint: string; readGuide: string; openGuideFailed: string; runAction: string; openSettings: string;
  market: SettingsPluginMarketText;
};

export type SettingsPluginMarketText = {
  title: string; hint: string; officeHint: (name: string) => string; install: string; uninstall: string; installed: string;
  inDevelopment: string;
  installNamed: (name: string) => string; uninstallNamed: (name: string) => string; enableNamed: (name: string) => string;
  cancel: string; cancelNamed: (name: string) => string;
  authors: string; operationFailed: (name: string) => string;
  installing: string; uninstalling: string; retry: string; connecting: string; verifying: string; unpacking: string;
  downloaded: (done: string, total: string) => string; progressNamed: (name: string) => string;
  openSettingsNamed: (name: string) => string; updateAvailable: (version: string) => string; updateNamed: (name: string) => string;
  upToDate: string;
  failure: Record<PluginFailure, string>;
  items: Record<MarketPluginId, { name: string; description: string }>;
};

export const zhCN: SettingsPluginsText = {
  clockWeather: clockWeatherZh,
  waterReminder: waterReminderZh,
  checkUpdate: "检查更新", runAction: "执行", openSettings: "打开设置", guide: "插件开发规范", guideHint: "插件是什么、怎么改造小岛源码、提交 PR 要附的演示和信息，以及审核上线流程。",
  readGuide: "查看规范", openGuideFailed: "没能打开开发规范，请再试一次。",
  empty: "暂无插件", installed: "已安装", available: "可安装", install: "安装", update: "更新",
  uninstall: "卸载", enabled: "启用", permissions: "权限", retry: "刷新", save: "保存",
  developer: "开发者", developerMode: "开发者模式", develop: "开发插件", unavailable: "暂无可安装插件", index: "插件索引", directory: "本地插件目录", load: "加载", secret: "输入以替换凭据",
  status: { starting: "启动中", running: "运行中", restarting: "正在重启", stopped: "已停用", failed: "启动失败" },
  permission: { network: "联网", "read-home-files": "读取本地文件", "write-home-files": "配置本地钩子", notifications: "消息", quota: "额度", sessions: "会话", panel: "岛上页面", "system-devices": "设备与音频输出", "desktop-windows": "桌面窗口", "private-browser": "独立登录" },
  market: {
    title: "插件市场", officeHint: (name) => `${name}的任务栏图标闪动时在岛上提醒，看不到消息内容；点提醒回到${name}。`,
    hint: "装上后，插件会出现在对应的小岛功能里。卡片上的开关可随时停用插件并保留设置。",
    install: "安装", uninstall: "卸载", installed: "已安装", inDevelopment: "开发中",
    installNamed: (name) => `安装 ${name}`, uninstallNamed: (name) => `卸载 ${name}`, enableNamed: (name) => `启用 ${name}`,
    cancel: "取消", cancelNamed: (name) => `取消安装 ${name}`,
    authors: "作者", operationFailed: (name) => `未能完成 ${name} 的操作，请重试。`,
    installing: "安装中…", uninstalling: "卸载中…", retry: "重试", connecting: "正在准备下载…", verifying: "正在校验安装包…", unpacking: "正在安装…",
    downloaded: (done, total) => `已下载 ${done} / ${total} MB`, progressNamed: (name) => `${name} 的安装进度`,
    openSettingsNamed: (name) => `打开 ${name} 的设置`, updateAvailable: (version) => `有新版本 ${version}`, updateNamed: (name) => `更新 ${name}`,
    upToDate: "已是最新版本",
    failure: {
      plugin_index_unavailable: "插件目录尚未发布或暂时无法连接，请稍后重试。",
      plugin_index_incompatible: "插件目录格式不受支持，或插件需要更新版本的 Fly Island。",
      plugin_not_listed: "插件尚未上架，请稍后重试。",
      plugin_package_download_failed: "安装包下载失败，请检查网络后重试。",
      plugin_package_integrity_failed: "安装包校验失败，文件大小或校验和不匹配。",
      plugin_package_invalid: "无法解压安装包，或插件清单不匹配。",
      plugin_install_failed: "无法保存插件文件，请检查磁盘空间和写入权限。",
      plugin_start_failed: "插件未能启动。请尝试重新启用或安装。",
      plugin_download_timeout: "下载超时：很久没有收到数据，请检查网络后重试。",
      plugin_download_interrupted: "下载中途网络断开，请重试。",
      plugin_download_http_client: "下载地址拒绝了请求（HTTP 4xx），安装包可能已下架。",
      plugin_download_http_server: "下载服务器出错（HTTP 5xx），请稍后重试。",
      plugin_disk_full: "磁盘空间不足，请清理后重试。",
      plugin_install_in_progress: "这个插件正在安装或卸载，请稍候。",
      plugin_uninstall_failed: "未能卸载插件，请重试。",
      plugin_install_cancelled: "已取消安装。",
    },
    items: {
      minimax: { name: "MiniMax Code", description: "在 AI 会话和消息页查看额度、任务进度和待审批提醒。" },
      "eye-care": { name: "护眼提醒", description: "在岛上查看用眼倒计时，休息时在各显示器上收到提醒。" },
      "device-battery": { name: "设备电量与音频", description: "查看支持的无线设备电量和低电量提醒，快速切换音频输出。" },
      calendarMarks: { name: "日历标记", description: "在中文界面的待办日历显示中国大陆节假日、调休、节气、纪念日和农历。" },
      clockWeather: { name: "时间与天气", description: "在收起的岛上显示时间与所选城市的天气，可分别开关和调整位置。" },
      "water-reminder": { name: "喝水提醒", description: "在岛上定时提醒喝水，可以设置间隔和多条轮换文案。" },
      dingtalk: { name: "钉钉", description: "钉钉有新消息时岛上提醒，消息页多一个钉钉标签，点一下回到钉钉。" },
      feishu: { name: "飞书", description: "飞书有新消息时岛上提醒，消息页多一个飞书标签，点一下回到飞书。" },
      wecom: { name: "企业微信", description: "企业微信有新消息时岛上提醒，消息页多一个企业微信标签。" },
      telegram: { name: "Telegram", description: "在岛上显示 Telegram Desktop 的 Windows 通知，消息页多一个 TG 标签，点一下打开对应对话。" },
      cursor: { name: "Cursor", description: "在 AI 会话里显示 Cursor Agent 的运行、等待与完成状态。" },
      kimiCode: { name: "Kimi Code", description: "显示 Kimi Code 的会话状态和套餐剩余额度。" },
      codebuddy: { name: "CodeBuddy", description: "在 AI 会话里显示 CodeBuddy CLI 的运行、完成与关闭状态，点一下回到运行它的终端。" },
      antigravity: { name: "Antigravity", description: "在 AI 会话里显示 Google Antigravity 的运行与完成状态，并按模型显示剩余额度。" },
      zcode: { name: "Z Code", description: "显示 Z Code 的套餐剩余额度和重置时间。" },
      hermes: { name: "Hermes", description: "显示 Nous Research Hermes Agent 的本地会话。" },
    },
  },
};

export const en: SettingsPluginsText = {
  clockWeather: clockWeatherEn,
  waterReminder: waterReminderEn,
  checkUpdate: "Check for updates", runAction: "Run", openSettings: "Open settings", guide: "Plugin development guide", guideHint: "What a plugin is, how to change the island's source, the demo and details a PR needs, and how review and release work.",
  readGuide: "Read guide", openGuideFailed: "Could not open the guide. Please try again.",
  empty: "No plugins yet", installed: "Installed", available: "Available", install: "Install", update: "Update",
  uninstall: "Uninstall", enabled: "Enable", permissions: "Permissions", retry: "Refresh", save: "Save",
  developer: "Developer", developerMode: "Developer mode", develop: "Develop plugins", unavailable: "No plugins available", index: "Plugin index", directory: "Local plugin folder", load: "Load", secret: "Enter to replace credential",
  status: { starting: "Starting", running: "Running", restarting: "Restarting", stopped: "Disabled", failed: "Failed to start" },
  permission: { network: "Network", "read-home-files": "Read local files", "write-home-files": "Configure local hooks", notifications: "Messages", quota: "Quota", sessions: "Sessions", panel: "Island page", "system-devices": "Devices and audio output", "desktop-windows": "Desktop windows", "private-browser": "Private sign-in" },
  market: {
    title: "Plugin market", officeHint: (name) => `Get a heads-up when ${name} flashes in the taskbar; message text is not read. Click the reminder to switch to the app.`,
    hint: "Installed plugins appear where you use them on the island. Use the switch on a card to turn its plugin off and keep its settings.",
    install: "Get", uninstall: "Remove", installed: "Installed", inDevelopment: "In development",
    installNamed: (name) => `Install ${name}`, uninstallNamed: (name) => `Remove ${name}`, enableNamed: (name) => `Enable ${name}`,
    cancel: "Cancel", cancelNamed: (name) => `Cancel installing ${name}`,
    authors: "Authors", operationFailed: (name) => `Could not complete the action for ${name}. Please try again.`,
    installing: "Installing…", uninstalling: "Removing…", retry: "Retry", connecting: "Preparing…", verifying: "Verifying…", unpacking: "Installing…",
    downloaded: (done, total) => `${done} / ${total} MB`, progressNamed: (name) => `Install progress of ${name}`,
    openSettingsNamed: (name) => `Open ${name} settings`, updateAvailable: (version) => `Version ${version}`, updateNamed: (name) => `Update ${name}`,
    upToDate: "All up to date",
    failure: {
      plugin_index_unavailable: "The plugin catalog is not published or temporarily unreachable. Try again later.",
      plugin_index_incompatible: "The catalog format is unsupported, or the plugin needs a newer version of Fly Island.",
      plugin_not_listed: "This plugin is not yet listed. Try again later.",
      plugin_package_download_failed: "Download failed. Check your connection and try again.",
      plugin_package_integrity_failed: "The download failed its size or checksum check.",
      plugin_package_invalid: "The package could not be unpacked, or its manifest did not match.",
      plugin_install_failed: "Could not save plugin files. Check disk space and write permissions.",
      plugin_start_failed: "The plugin could not start. Try enabling or installing it again.",
      plugin_download_timeout: "Download timed out: no data arrived for a while. Check your connection.",
      plugin_download_interrupted: "The connection dropped during the download. Try again.",
      plugin_download_http_client: "The server refused the download (HTTP 4xx). The package may be gone.",
      plugin_download_http_server: "The download server failed (HTTP 5xx). Try again later.",
      plugin_disk_full: "Not enough disk space. Free some and try again.",
      plugin_install_in_progress: "This plugin is already being installed or removed.",
      plugin_uninstall_failed: "Could not remove the plugin. Try again.",
      plugin_install_cancelled: "Installation cancelled.",
    },
    items: {
      minimax: { name: "MiniMax Code", description: "See quota, session progress and pending approvals on the island." },
      "eye-care": { name: "Eye Care", description: "Track screen time on the island and get break reminders on each display." },
      "device-battery": { name: "Device Battery & Audio", description: "Check battery levels for supported wireless devices and switch audio outputs." },
      calendarMarks: { name: "Calendar Marks", description: "Adds mainland China holidays, make-up workdays, solar terms, observances and lunar dates when the app language is Chinese." },
      clockWeather: { name: "Clock & Weather", description: "Show the time and your city’s weather on the collapsed island, with separate switches and positions." },
      "water-reminder": { name: "Water Reminder", description: "Get timed water reminders on the island with a custom interval and rotating messages." },
      dingtalk: { name: "DingTalk", description: "Get a heads-up on the island for new DingTalk messages, with a DingTalk tab in Messages." },
      feishu: { name: "Feishu", description: "Get a heads-up on the island for new Feishu messages, with a Feishu tab in Messages." },
      wecom: { name: "WeCom", description: "Get a heads-up on the island for new WeCom messages, with a WeCom tab in Messages." },
      telegram: { name: "Telegram", description: "Show Telegram Desktop's Windows notifications on the island, with a TG tab in Messages. Click one to open its chat." },
      cursor: { name: "Cursor", description: "Show Cursor Agent sessions as running, waiting or done in AI sessions." },
      kimiCode: { name: "Kimi Code", description: "Show Kimi Code sessions and how much of your plan is left." },
      codebuddy: { name: "CodeBuddy", description: "Show CodeBuddy CLI sessions, running or finished, and open the terminal running one." },
      antigravity: { name: "Antigravity", description: "Show Google Antigravity sessions, running or finished, and how much quota each model has left." },
      zcode: { name: "Z Code", description: "Show how much of your Z Code plan is left and when it resets." },
      hermes: { name: "Hermes", description: "Show local sessions of Nous Research's Hermes Agent." },
    },
  },
};
