export type SettingsPluginsText = {
  empty: string; installed: string; available: string; install: string; update: string;
  uninstall: string; enabled: string; permissions: string; retry: string; save: string;
  developer: string; index: string; directory: string; load: string; secret: string;
  status: Record<string, string>; permission: Record<string, string>;
};

export const zhCN: SettingsPluginsText = {
  empty: "暂无插件", installed: "已安装", available: "可安装", install: "安装", update: "更新",
  uninstall: "卸载", enabled: "启用", permissions: "权限", retry: "刷新", save: "保存",
  developer: "开发者模式", index: "插件索引", directory: "本地插件目录", load: "加载", secret: "输入以替换凭据",
  status: { starting: "启动中", running: "运行中", restarting: "正在重启", stopped: "已停用", failed: "启动失败" },
  permission: { network: "联网", "read-home-files": "本地文件", notifications: "消息", quota: "额度", sessions: "会话", "desktop-windows": "桌面窗口", "private-browser": "独立登录" },
};

export const en: SettingsPluginsText = {
  empty: "No plugins yet", installed: "Installed", available: "Available", install: "Install", update: "Update",
  uninstall: "Uninstall", enabled: "Enable", permissions: "Permissions", retry: "Refresh", save: "Save",
  developer: "Developer mode", index: "Plugin index", directory: "Local plugin folder", load: "Load", secret: "Enter to replace credential",
  status: { starting: "Starting", running: "Running", restarting: "Restarting", stopped: "Disabled", failed: "Failed to start" },
  permission: { network: "Network", "read-home-files": "Local files", notifications: "Messages", quota: "Quota", sessions: "Sessions", "desktop-windows": "Desktop windows", "private-browser": "Private sign-in" },
};
