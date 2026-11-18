export type SettingsClipboardText = {
  title: string;
  displayTitle: string;
  captureImages: string;
  maxItems: string;
  visibleRows: string;
  detached: string;
  /** Unpinned clipboard window closes when another window is clicked. */
  closeOnBlur: string;
  closeOnBlurHint: string;
  /** Where the history and its images are stored. */
  storageTitle: string;
  storageFolder: string;
  storageHint: string;
  storageMove: string;
  storageMoving: string;
  storageMoved: string;
  storageReset: string;
  storageChoose: string;
  shortcut: string;
  shortcutEnabled: string;
  pressKeys: string;
};

export const zhCN: SettingsClipboardText = {
  title: "记录内容",
  displayTitle: "显示与窗口",
  captureImages: "记录图片",
  maxItems: "最多保存几条",
  visibleRows: "一次显示几条",
  detached: "在单独窗口中打开剪贴板",
  closeOnBlur: "点击窗口外时关闭",
  closeOnBlurHint: "仅在窗口未钉选时生效",
  storageTitle: "存储位置",
  storageFolder: "剪贴板数据文件夹",
  storageHint: "更换文件夹时会把已有记录和图片一起移过去，全部复制成功后才删除旧文件",
  storageMove: "移动到此处",
  storageMoving: "正在移动…",
  storageMoved: "已移动",
  storageReset: "恢复默认位置",
  storageChoose: "选择剪贴板数据文件夹",
  shortcut: "展开快捷键",
  shortcutEnabled: "启用展开快捷键",
  pressKeys: "按下组合键",
};

export const en: SettingsClipboardText = {
  title: "What's saved",
  displayTitle: "Display & window",
  captureImages: "Record images",
  maxItems: "Max entries",
  visibleRows: "Visible rows",
  detached: "Open in a separate window",
  closeOnBlur: "Close when clicking elsewhere",
  closeOnBlurHint: "Only while the window is not pinned",
  storageTitle: "Storage",
  storageFolder: "Clipboard data folder",
  storageHint: "Changing the folder moves the existing history and images with it; old files are removed only after everything has been copied",
  storageMove: "Move here",
  storageMoving: "Moving…",
  storageMoved: "Moved",
  storageReset: "Use default folder",
  storageChoose: "Choose the clipboard data folder",
  shortcut: "Expand shortcut",
  shortcutEnabled: "Enable expand shortcut",
  pressKeys: "Press keys",
};
