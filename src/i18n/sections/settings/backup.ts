export type SettingsBackupText = {
  title: string;
  save: string;
  restore: string;
  /** Link text at the end of the export row. */
  saveAction: string;
  /** Link text at the end of the restore row. */
  restoreAction: string;
  hint: string;
  saved: (path: string) => string;
  reveal: string;
  confirmRestore: string;
  restored: (count: number) => string;
  restart: string;
  problems: { notJson: string; notBackup: string; newerVersion: string; empty: string };
};

export const zhCN: SettingsBackupText = {
  title: "备份与恢复",
  save: "导出设置",
  restore: "从文件恢复",
  saveAction: "导出…",
  restoreAction: "选择文件…",
  hint: "把外观、展开收起、快捷键、翻译、消息、AI Agent（提醒、审批、手机推送、声音）、歌词偏移、插件页面、更新等设置导出成一个文件，重装系统或换电脑后再导入。不包含待办、窗口位置和保存在 Windows 凭据管理器里的密钥与授权码。",
  saved: (path) => `已导出到 ${path}`,
  reveal: "在文件夹中显示",
  confirmRestore: "用这个文件里的设置替换当前设置？当前设置不会另外保存，需要的话请先导出一份。",
  restored: (count) => `已恢复 ${count} 项设置。大部分立即生效，个别设置重启岛屿后生效。`,
  restart: "立即重启岛屿",
  problems: {
    notJson: "这个文件不是有效的 JSON，无法恢复。",
    notBackup: "这不是 fly-island 导出的设置文件。",
    newerVersion: "这个设置文件来自更新的版本，请先把岛屿更新到最新版。",
    empty: "这个文件里没有可以恢复的设置。",
  },
};

export const en: SettingsBackupText = {
  title: "Backup and restore",
  save: "Export settings",
  restore: "Restore from file",
  saveAction: "Export…",
  restoreAction: "Choose file…",
  hint: "Export appearance, expand and tuck, shortcuts, translation, messages, AI Agent (alerts, approvals, phone push, sounds), lyrics offsets, plugin pages, updates and other settings to a file, and import it after reinstalling or on another computer. Todos, window positions, and keys and codes kept in Windows Credential Manager are not included.",
  saved: (path) => `Exported to ${path}`,
  reveal: "Show in folder",
  confirmRestore: "Replace the current settings with the ones in this file? The current settings are not saved separately; export them first if you need them.",
  restored: (count) => `Restored ${count} settings. Most apply now; a few apply after the island restarts.`,
  restart: "Restart the island",
  problems: {
    notJson: "This file is not valid JSON and cannot be restored.",
    notBackup: "This is not a settings file exported by fly-island.",
    newerVersion: "This settings file comes from a newer version. Update the island first.",
    empty: "This file has no settings to restore.",
  },
};
