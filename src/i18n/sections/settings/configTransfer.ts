export type SettingsConfigTransferText = {
  title: string; hint: string; export: string; import: string; includeHistory: string;
  exportHint: string; continue: string; cancel: string; exported: string; busy: string;
  confirm: string; confirmAgain: string; confirmAction: string; restartAction: string;
  success: string; credentials: string; missingPlugins: string; warnings: string; dismiss: string;
  invalidJson: string; wrongApp: string; unsupportedVersion: string; invalidStructure: string;
  tooLarge: string; storageUnavailable: string; storageRollbackFailed: string; failed: string;
  clipboardIncluded: string; clipboardExcluded: string; startupFailed: string;
};

export const zhCN: SettingsConfigTransferText = {
  title: "备份与迁移", hint: "将设置、待办、笔记和插件偏好迁移到另一台电脑。密钥和窗口位置不包含在内。",
  export: "导出配置…", import: "导入配置…", includeHistory: "包含剪贴板历史",
  exportHint: "默认包含所有设置和用户数据。剪贴板历史可能含有私人信息，按需勾选。",
  continue: "选择保存位置…", cancel: "取消", exported: "配置已导出。", busy: "正在处理…",
  confirm: "将覆盖当前所有设置与待办，建议先导出当前配置备份。",
  confirmAgain: "再次确认：导入后将重启 Fly Island，当前设置、待办、笔记及插件偏好将被备份替换。",
  confirmAction: "继续导入", restartAction: "确认覆盖并重启",
  success: "配置导入已完成。", credentials: "如有使用，请重新填写邮箱授权码、翻译服务 API 密钥和插件密钥，并重新连接 WorkBuddy / 豆包等账号。",
  missingPlugins: "以下插件缺少对应版本，请前往插件市场重新安装；非秘密设置已保留：",
  warnings: "以下项目需要检查：", dismiss: "知道了",
  invalidJson: "文件不是有效的 JSON，请选择 Fly Island 导出的配置备份。",
  wrongApp: "这不是 Fly Island 的配置备份。", unsupportedVersion: "不支持此备份版本或旧外观主题格式，请更新 Fly Island 或重新导出配置。",
  invalidStructure: "备份结构不完整或包含无效数据，未导入。", tooLarge: "备份超过 256 MB，请不包含剪贴板历史后重新导出。",
  storageUnavailable: "无法写入本地设置，已尝试恢复原配置。请检查可用空间后重试。",
  storageRollbackFailed: "本地存储不可用，无法完整恢复原配置。请保留备份并在存储恢复后重新导入。",
  failed: "配置迁移失败：", clipboardIncluded: "此备份包含剪贴板历史，将替换当前历史。",
  clipboardExcluded: "此备份不含剪贴板历史；本机历史将保留，剪贴板设置会更新。",
  startupFailed: "配置恢复未能完成，请重启 Fly Island 后重试。",
};

export const en: SettingsConfigTransferText = {
  title: "Backup & transfer", hint: "Move settings, todos, notes and plugin preferences to another computer. Keys and window positions are excluded.",
  export: "Export configuration…", import: "Import configuration…", includeHistory: "Include clipboard history",
  exportHint: "All settings and user data are included by default. Clipboard history may contain private information; include it only when needed.",
  continue: "Choose save location…", cancel: "Cancel", exported: "Configuration exported.", busy: "Working…",
  confirm: "This will replace all current settings and todos. Export a backup of this computer first.",
  confirmAgain: "Confirm again: Fly Island will restart and replace your settings, todos, notes and plugin preferences with this backup.",
  confirmAction: "Continue import", restartAction: "Replace and restart",
  success: "Configuration import completed.", credentials: "If used, re-enter mail authorization codes, translation API keys and plugin secrets, and reconnect accounts such as WorkBuddy / Doubao.",
  missingPlugins: "Reinstall these plugin versions from the plugin market. Their non-secret preferences have been kept:",
  warnings: "Check the following items:", dismiss: "Got it",
  invalidJson: "This is not valid JSON. Choose a configuration backup exported by Fly Island.",
  wrongApp: "This is not a Fly Island configuration backup.", unsupportedVersion: "This backup version or legacy theme format is not supported. Update Fly Island or export a new configuration backup.",
  invalidStructure: "The backup is incomplete or contains invalid data. Nothing was imported.", tooLarge: "The backup exceeds 256 MB. Export again without clipboard history.",
  storageUnavailable: "Local settings could not be written. Restoring the original configuration was attempted. Check free space and try again.",
  storageRollbackFailed: "Local storage is unavailable and the original configuration could not be fully restored. Keep your backup and import again after storage recovers.",
  failed: "Configuration transfer failed: ", clipboardIncluded: "This backup includes clipboard history and will replace the current history.",
  clipboardExcluded: "This backup excludes clipboard history. This computer's history will remain; clipboard preferences will be updated.",
  startupFailed: "Configuration recovery could not finish. Restart Fly Island and try again.",
};
