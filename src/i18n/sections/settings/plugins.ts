import type { MarketPluginId } from "../../../features/plugins/native/catalog";

import { zhCN as clockWeatherZh, en as clockWeatherEn, type ClockWeatherText } from "./clockWeather.ts";

export type SettingsPluginsText = {
  clockWeather: ClockWeatherText;
  empty: string; installed: string; available: string; install: string; update: string;
  uninstall: string; enabled: string; permissions: string; retry: string; save: string;
  developer: string; developerMode: string; develop: string; unavailable: string; index: string; directory: string; load: string; secret: string;
  status: Record<string, string>; permission: Record<string, string>;
  guide: string; checkUpdate: string;
  guideHint: string; readGuide: string; openGuideFailed: string;
  market: SettingsPluginMarketText;
};

export type SettingsPluginMarketText = {
  title: string; hint: string; officeTitle: string; officeHint: string; install: string; uninstall: string; installed: string;
  inDevelopment: string;
  installNamed: (name: string) => string; uninstallNamed: (name: string) => string; enableNamed: (name: string) => string;
  by: string; operationFailed: (name: string) => string;
  items: Record<MarketPluginId, { name: string; description: string }>;
};

export const zhCN: SettingsPluginsText = {
  clockWeather: clockWeatherZh,
  checkUpdate: "检查更新", guide: "插件开发规范", guideHint: "插件是什么、怎么改造小岛源码、提交 PR 要附的演示和信息，以及审核上线流程。",
  readGuide: "查看规范", openGuideFailed: "没能打开开发规范，请再试一次。",
  empty: "暂无插件", installed: "已安装", available: "可安装", install: "安装", update: "更新",
  uninstall: "卸载", enabled: "启用", permissions: "权限", retry: "刷新", save: "保存",
  developer: "开发者", developerMode: "开发者模式", develop: "开发插件", unavailable: "暂无可安装插件", index: "插件索引", directory: "本地插件目录", load: "加载", secret: "输入以替换凭据",
  status: { starting: "启动中", running: "运行中", restarting: "正在重启", stopped: "已停用", failed: "启动失败" },
  permission: { network: "联网", "read-home-files": "读取本地文件", "write-home-files": "配置本地钩子", notifications: "消息", quota: "额度", sessions: "会话", panel: "岛上页面", "system-devices": "设备与音频输出", "desktop-windows": "桌面窗口", "private-browser": "独立登录" },
  market: {
    title: "插件市场", officeTitle: "办公消息", officeHint: "钉钉、飞书、企业微信的任务栏图标闪动时在岛上提醒，看不到消息内容；点提醒回到对应软件。",
    hint: "装上后，插件会出现在对应的小岛功能里。卡片上的开关可随时停用插件并保留设置。",
    install: "安装", uninstall: "卸载", installed: "已安装", inDevelopment: "开发中",
    installNamed: (name) => `安装 ${name}`, uninstallNamed: (name) => `卸载 ${name}`, enableNamed: (name) => `启用 ${name}`,
    by: "作者", operationFailed: (name) => `未能完成 ${name} 的操作，请重试。`,
    items: {
      minimax: { name: "MiniMax Code", description: "在 AI 会话和消息页查看额度、任务进度和待审批提醒。" },
      "eye-care": { name: "护眼提醒", description: "在岛上查看用眼倒计时，休息时在各显示器上收到提醒。" },
      "device-battery": { name: "设备电量与音频", description: "查看支持的无线设备电量和低电量提醒，快速切换音频输出。" },
      calendarMarks: { name: "日历标记", description: "在中文界面的待办日历显示中国大陆节假日、调休、节气、纪念日和农历。" },
      clockWeather: { name: "时间与天气", description: "在收起的岛上显示时间与所选城市的天气，可分别开关和调整位置。" },
      dingtalk: { name: "钉钉", description: "钉钉有新消息时岛上提醒，消息页多一个钉钉标签，点一下回到钉钉。" },
      feishu: { name: "飞书", description: "飞书有新消息时岛上提醒，消息页多一个飞书标签，点一下回到飞书。" },
      wecom: { name: "企业微信", description: "企业微信有新消息时岛上提醒，消息页多一个企业微信标签。" },
      cursor: { name: "Cursor", description: "在 AI 会话里显示 Cursor Agent 的运行、等待与完成状态。" },
      kimiCode: { name: "Kimi Code", description: "显示 Kimi Code 的会话状态和套餐剩余额度。" },
      codebuddy: { name: "CodeBuddy", description: "在 AI 会话里显示 CodeBuddy CLI 的运行、完成与关闭状态，点一下回到运行它的终端。" },
      zcode: { name: "Z Code", description: "显示 Z Code 的套餐剩余额度和重置时间。" },
      hermes: { name: "Hermes", description: "显示 Nous Research Hermes Agent 的本地会话。" },
    },
  },
};

export const en: SettingsPluginsText = {
  clockWeather: clockWeatherEn,
  checkUpdate: "Check for updates", guide: "Plugin development guide", guideHint: "What a plugin is, how to change the island's source, the demo and details a PR needs, and how review and release work.",
  readGuide: "Read guide", openGuideFailed: "Could not open the guide. Please try again.",
  empty: "No plugins yet", installed: "Installed", available: "Available", install: "Install", update: "Update",
  uninstall: "Uninstall", enabled: "Enable", permissions: "Permissions", retry: "Refresh", save: "Save",
  developer: "Developer", developerMode: "Developer mode", develop: "Develop plugins", unavailable: "No plugins available", index: "Plugin index", directory: "Local plugin folder", load: "Load", secret: "Enter to replace credential",
  status: { starting: "Starting", running: "Running", restarting: "Restarting", stopped: "Disabled", failed: "Failed to start" },
  permission: { network: "Network", "read-home-files": "Read local files", "write-home-files": "Configure local hooks", notifications: "Messages", quota: "Quota", sessions: "Sessions", panel: "Island page", "system-devices": "Devices and audio output", "desktop-windows": "Desktop windows", "private-browser": "Private sign-in" },
  market: {
    title: "Plugin market", officeTitle: "Work messages", officeHint: "Get a heads-up when DingTalk, Feishu or WeCom flashes in the taskbar; message text is not read. Click the reminder to switch to the app.",
    hint: "Installed plugins appear where you use them on the island. Use the switch on a card to turn its plugin off and keep its settings.",
    install: "Get", uninstall: "Remove", installed: "Installed", inDevelopment: "In development",
    installNamed: (name) => `Install ${name}`, uninstallNamed: (name) => `Remove ${name}`, enableNamed: (name) => `Enable ${name}`,
    by: "by", operationFailed: (name) => `Could not complete the action for ${name}. Please try again.`,
    items: {
      minimax: { name: "MiniMax Code", description: "See quota, session progress and pending approvals on the island." },
      "eye-care": { name: "Eye Care", description: "Track screen time on the island and get break reminders on each display." },
      "device-battery": { name: "Device Battery & Audio", description: "Check battery levels for supported wireless devices and switch audio outputs." },
      calendarMarks: { name: "Calendar Marks", description: "Adds mainland China holidays, make-up workdays, solar terms, observances and lunar dates when the app language is Chinese." },
      clockWeather: { name: "Clock & Weather", description: "Show the time and your city’s weather on the collapsed island, with separate switches and positions." },
      dingtalk: { name: "DingTalk", description: "Get a heads-up on the island for new DingTalk messages, with a DingTalk tab in Messages." },
      feishu: { name: "Feishu", description: "Get a heads-up on the island for new Feishu messages, with a Feishu tab in Messages." },
      wecom: { name: "WeCom", description: "Get a heads-up on the island for new WeCom messages, with a WeCom tab in Messages." },
      cursor: { name: "Cursor", description: "Show Cursor Agent sessions as running, waiting or done in AI sessions." },
      kimiCode: { name: "Kimi Code", description: "Show Kimi Code sessions and how much of your plan is left." },
      codebuddy: { name: "CodeBuddy", description: "Show CodeBuddy CLI sessions, running or finished, and open the terminal running one." },
      zcode: { name: "Z Code", description: "Show how much of your Z Code plan is left and when it resets." },
      hermes: { name: "Hermes", description: "Show local sessions of Nous Research's Hermes Agent." },
    },
  },
};
