import type { NativePluginId, NativePluginKind } from "../../../features/plugins/native/catalog";

import { zhCN as clockWeatherZh, en as clockWeatherEn, type ClockWeatherText } from "./clockWeather.ts";

export type SettingsPluginsText = {
  clockWeather: ClockWeatherText;
  empty: string; installed: string; available: string; install: string; update: string;
  uninstall: string; enabled: string; permissions: string; retry: string; save: string;
  developer: string; developerMode: string; develop: string; unavailable: string; index: string; directory: string; load: string; secret: string;
  status: Record<string, string>; permission: Record<string, string>;
  plan: string; comingSoon: string; invitation: string; guide: string;
  guideHint: string; readGuide: string; openGuideFailed: string;
  market: SettingsPluginMarketText;
};

export type SettingsPluginMarketText = {
  title: string; hint: string; officeTitle: string; officeHint: string; install: string; uninstall: string; installed: string;
  installNamed: (name: string) => string; uninstallNamed: (name: string) => string;
  kinds: Record<NativePluginKind, string>;
  items: Record<NativePluginId, { name: string; description: string }>;
};

export const zhCN: SettingsPluginsText = {
  clockWeather: clockWeatherZh,
  plan: "插件开发计划", comingSoon: "插件功能即将上线",
  invitation: "插件可以改造小岛原有功能，也可以做全新的功能，装上后就是小岛的一部分，默认不安装、按需下载。欢迎基于小岛源码开发并提交 PR，flyl1u 审核适配后上线。",
  guide: "插件开发规范", guideHint: "插件是什么、怎么改造小岛源码、提交 PR 要附的演示和信息，以及审核上线流程。",
  readGuide: "查看规范", openGuideFailed: "没能打开开发规范，请再试一次。",
  empty: "暂无插件", installed: "已安装", available: "可安装", install: "安装", update: "更新",
  uninstall: "卸载", enabled: "启用", permissions: "权限", retry: "刷新", save: "保存",
  developer: "开发者", developerMode: "开发者模式", develop: "开发插件", unavailable: "暂无可安装插件", index: "插件索引", directory: "本地插件目录", load: "加载", secret: "输入以替换凭据",
  status: { starting: "启动中", running: "运行中", restarting: "正在重启", stopped: "已停用", failed: "启动失败" },
  permission: { network: "联网", "read-home-files": "本地文件", notifications: "消息", quota: "额度", sessions: "会话", "desktop-windows": "桌面窗口", "private-browser": "独立登录" },
  market: {
    title: "插件市场", officeTitle: "办公消息", officeHint: "钉钉、飞书、企业微信的任务栏图标闪动时在岛上提醒，看不到消息内容；点提醒回到对应软件。",
    hint: "装上后成为小岛自己的一部分：消息类出现在消息页的标签里，Agent 类出现在 AI 会话里，可在对应设置页单独开关；岛屿类直接显示在收起的岛上。",
    install: "安装", uninstall: "卸载", installed: "已安装",
    installNamed: (name) => `安装 ${name}`, uninstallNamed: (name) => `卸载 ${name}`,
    kinds: { messages: "消息", agent: "Agent", island: "岛屿" },
    items: {
      clockWeather: { name: "时间与天气", description: "在收起的岛上显示时间与所选城市的天气，可分别开关和调整位置。" },
      dingtalk: { name: "钉钉", description: "钉钉有新消息时岛上提醒，消息页多一个钉钉标签，点一下回到钉钉。" },
      feishu: { name: "飞书", description: "飞书有新消息时岛上提醒，消息页多一个飞书标签，点一下回到飞书。" },
      wecom: { name: "企业微信", description: "企业微信有新消息时岛上提醒，消息页多一个企业微信标签。" },
      cursor: { name: "Cursor", description: "在 AI 会话里显示 Cursor Agent 的运行、等待与完成状态。" },
      kimiCode: { name: "Kimi Code", description: "显示 Kimi Code 的会话状态和套餐剩余额度。" },
      zcode: { name: "Z Code", description: "显示 Z Code 的套餐剩余额度和重置时间。" },
      hermes: { name: "Hermes", description: "显示 Nous Research Hermes Agent 的本地会话。" },
      minimaxCode: { name: "MiniMax Code", description: "显示 MiniMax Code 的会话状态和 Token Plan 剩余额度。" },
    },
  },
};

export const en: SettingsPluginsText = {
  clockWeather: clockWeatherEn,
  plan: "Plugin development", comingSoon: "Plugins are coming soon",
  invitation: "A plugin upgrades an island feature or adds a new one, and becomes part of the island once installed; plugins are optional and downloaded on demand. Build one from the island's source and open a PR; flyl1u reviews, adapts and ships it.",
  guide: "Plugin development guide", guideHint: "What a plugin is, how to change the island's source, the demo and details a PR needs, and how review and release work.",
  readGuide: "Read guide", openGuideFailed: "Could not open the guide. Please try again.",
  empty: "No plugins yet", installed: "Installed", available: "Available", install: "Install", update: "Update",
  uninstall: "Uninstall", enabled: "Enable", permissions: "Permissions", retry: "Refresh", save: "Save",
  developer: "Developer", developerMode: "Developer mode", develop: "Develop plugins", unavailable: "No plugins available", index: "Plugin index", directory: "Local plugin folder", load: "Load", secret: "Enter to replace credential",
  status: { starting: "Starting", running: "Running", restarting: "Restarting", stopped: "Disabled", failed: "Failed to start" },
  permission: { network: "Network", "read-home-files": "Local files", notifications: "Messages", quota: "Quota", sessions: "Sessions", "desktop-windows": "Desktop windows", "private-browser": "Private sign-in" },
  market: {
    title: "Plugin market", officeTitle: "Work messages", officeHint: "Get a heads-up when DingTalk, Feishu or WeCom flashes in the taskbar; message text is not read. Click the reminder to switch to the app.",
    hint: "Installed plugins become part of the island: message plugins add a tab to Messages, Agent plugins join AI sessions, each with its own switch in settings. Island plugins add collapsed status items.",
    install: "Get", uninstall: "Remove", installed: "Installed",
    installNamed: (name) => `Install ${name}`, uninstallNamed: (name) => `Remove ${name}`,
    kinds: { messages: "Messages", agent: "Agent", island: "Island" },
    items: {
      clockWeather: { name: "Clock & Weather", description: "Show the time and your city’s weather on the collapsed island, with separate switches and positions." },
      dingtalk: { name: "DingTalk", description: "Get a heads-up on the island for new DingTalk messages, with a DingTalk tab in Messages." },
      feishu: { name: "Feishu", description: "Get a heads-up on the island for new Feishu messages, with a Feishu tab in Messages." },
      wecom: { name: "WeCom", description: "Get a heads-up on the island for new WeCom messages, with a WeCom tab in Messages." },
      cursor: { name: "Cursor", description: "Show Cursor Agent sessions as running, waiting or done in AI sessions." },
      kimiCode: { name: "Kimi Code", description: "Show Kimi Code sessions and how much of your plan is left." },
      zcode: { name: "Z Code", description: "Show how much of your Z Code plan is left and when it resets." },
      hermes: { name: "Hermes", description: "Show local sessions of Nous Research's Hermes Agent." },
      minimaxCode: { name: "MiniMax Code", description: "Show MiniMax Code sessions and how much of your Token Plan is left." },
    },
  },
};
