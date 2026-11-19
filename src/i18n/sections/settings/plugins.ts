export type SettingsPluginsText = {
  empty: string; installed: string; available: string; install: string; update: string;
  uninstall: string; enabled: string; permissions: string; retry: string; save: string;
  developer: string; developerMode: string; develop: string; unavailable: string; index: string; directory: string; load: string; secret: string;
  status: Record<string, string>; permission: Record<string, string>;
  plan: string; comingSoon: string; invitation: string; guide: string;
  guideHint: string; readGuide: string; openGuideFailed: string;
};

export const zhCN: SettingsPluginsText = {
  plan: "插件开发计划", comingSoon: "插件功能即将上线",
  invitation: "插件是对小岛原有功能的改造，装上后就是小岛的一部分，默认不安装、按需下载。欢迎基于小岛源码开发并提交 PR，flyl1u 审核适配后上线。",
  guide: "插件开发规范", guideHint: "插件是什么、怎么改造小岛源码、提交 PR 要附的演示和信息，以及审核上线流程。",
  readGuide: "查看规范", openGuideFailed: "没能打开开发规范，请再试一次。",
  empty: "暂无插件", installed: "已安装", available: "可安装", install: "安装", update: "更新",
  uninstall: "卸载", enabled: "启用", permissions: "权限", retry: "刷新", save: "保存",
  developer: "开发者", developerMode: "开发者模式", develop: "开发插件", unavailable: "暂无可安装插件", index: "插件索引", directory: "本地插件目录", load: "加载", secret: "输入以替换凭据",
  status: { starting: "启动中", running: "运行中", restarting: "正在重启", stopped: "已停用", failed: "启动失败" },
  permission: { network: "联网", "read-home-files": "本地文件", notifications: "消息", quota: "额度", sessions: "会话", "desktop-windows": "桌面窗口", "private-browser": "独立登录" },
};

export const en: SettingsPluginsText = {
  plan: "Plugin development", comingSoon: "Plugins are coming soon",
  invitation: "A plugin upgrades an island feature and becomes part of the island once installed; plugins are optional and downloaded on demand. Build one from the island's source and open a PR; flyl1u reviews, adapts and ships it.",
  guide: "Plugin development guide", guideHint: "What a plugin is, how to change the island's source, the demo and details a PR needs, and how review and release work.",
  readGuide: "Read guide", openGuideFailed: "Could not open the guide. Please try again.",
  empty: "No plugins yet", installed: "Installed", available: "Available", install: "Install", update: "Update",
  uninstall: "Uninstall", enabled: "Enable", permissions: "Permissions", retry: "Refresh", save: "Save",
  developer: "Developer", developerMode: "Developer mode", develop: "Develop plugins", unavailable: "No plugins available", index: "Plugin index", directory: "Local plugin folder", load: "Load", secret: "Enter to replace credential",
  status: { starting: "Starting", running: "Running", restarting: "Restarting", stopped: "Disabled", failed: "Failed to start" },
  permission: { network: "Network", "read-home-files": "Local files", notifications: "Messages", quota: "Quota", sessions: "Sessions", "desktop-windows": "Desktop windows", "private-browser": "Private sign-in" },
};
