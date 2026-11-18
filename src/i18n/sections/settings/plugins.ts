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
  invitation: "欢迎先按规范开发插件并提交 PR。flyl1u 审核合并后统一发布。",
  guide: "插件开发规范", guideHint: "从示例与 API 开始，了解如何融入小岛，以及提交与审核要求。",
  readGuide: "查看规范", openGuideFailed: "没能打开开发规范，请再试一次。",
  empty: "暂无插件", installed: "已安装", available: "可安装", install: "安装", update: "更新",
  uninstall: "卸载", enabled: "启用", permissions: "权限", retry: "刷新", save: "保存",
  developer: "开发者", developerMode: "开发者模式", develop: "开发插件", unavailable: "暂无可安装插件", index: "插件索引", directory: "本地插件目录", load: "加载", secret: "输入以替换凭据",
  status: { starting: "启动中", running: "运行中", restarting: "正在重启", stopped: "已停用", failed: "启动失败" },
  permission: { network: "联网", "read-home-files": "本地文件", notifications: "消息", quota: "额度", sessions: "会话", "desktop-windows": "桌面窗口", "private-browser": "独立登录" },
};

export const en: SettingsPluginsText = {
  plan: "Plugin development", comingSoon: "Plugins are coming soon",
  invitation: "Start building with the guide and submit a PR. flyl1u will review, merge and publish approved plugins.",
  guide: "Plugin development guide", guideHint: "Explore the example, API, island design guidelines and contribution requirements.",
  readGuide: "Read guide", openGuideFailed: "Could not open the guide. Please try again.",
  empty: "No plugins yet", installed: "Installed", available: "Available", install: "Install", update: "Update",
  uninstall: "Uninstall", enabled: "Enable", permissions: "Permissions", retry: "Refresh", save: "Save",
  developer: "Developer", developerMode: "Developer mode", develop: "Develop plugins", unavailable: "No plugins available", index: "Plugin index", directory: "Local plugin folder", load: "Load", secret: "Enter to replace credential",
  status: { starting: "Starting", running: "Running", restarting: "Restarting", stopped: "Disabled", failed: "Failed to start" },
  permission: { network: "Network", "read-home-files": "Local files", notifications: "Messages", quota: "Quota", sessions: "Sessions", "desktop-windows": "Desktop windows", "private-browser": "Private sign-in" },
};
