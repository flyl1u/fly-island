export type SettingsFileShelfText = {
  title: string;
  expandOnDrop: string;
  expandOnDropHint: string;
  autoCleanup: string;
  cleanupNever: string;
  cleanupDays: (days: number) => string;
  removeMissing: string;
  removeAfterDragOut: string;
  maxItems: string;
  doubleClick: string;
  doubleClickOpen: string;
  doubleClickReveal: string;
  showCount: string;
  cleanupHint: string;
};

export const zhCN: SettingsFileShelfText = {
  title: "文件中转",
  expandOnDrop: "拖入文件时自动展开",
  expandOnDropHint: "关闭后，只能把文件拖到已经打开的文件中转页里。",
  autoCleanup: "自动清理",
  cleanupNever: "从不",
  cleanupDays: (days) => (days === 1 ? "1 天后" : `${days} 天后`),
  removeMissing: "自动移除已失效的文件",
  removeAfterDragOut: "拖出后从列表移除",
  maxItems: "最多保留条数",
  doubleClick: "双击文件",
  doubleClickOpen: "打开文件",
  doubleClickReveal: "在文件夹中显示",
  showCount: "折叠时显示文件数量",
  cleanupHint: "清理和移除只影响列表，不会删除你的文件。",
};

export const en: SettingsFileShelfText = {
  title: "File shelf",
  expandOnDrop: "Open when files are dragged in",
  expandOnDropHint: "When off, files can only be dropped on the shelf page while it is open.",
  autoCleanup: "Auto clean up",
  cleanupNever: "Never",
  cleanupDays: (days) => (days === 1 ? "After 1 day" : `After ${days} days`),
  removeMissing: "Remove files that were moved or deleted",
  removeAfterDragOut: "Remove after dragging out",
  maxItems: "Maximum entries",
  doubleClick: "Double-click a file",
  doubleClickOpen: "Open it",
  doubleClickReveal: "Show in folder",
  showCount: "Show the file count when collapsed",
  cleanupHint: "Cleaning up only changes the list; your files are never deleted.",
};
