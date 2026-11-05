export type FileShelfText = {
  title: string;
  clear: string;
  confirmClear: string;
  empty: string;
  dropHint: string;
  dragHint: string;
  folder: string;
  missing: string;
  missingHint: string;
  copyItem: string;
  copied: string;
  reveal: string;
  removeItem: string;
  alreadyOnShelf: string;
  dragHintReveal: string;
  unreachable: string;
  unreachableHint: string;
  pin: string;
  unpin: string;
  searchPlaceholder: string;
  searchLabel: string;
  clearSearch: string;
  emptySearch: string;
  selectedCount: (count: number) => string;
  copySelected: string;
  removeSelected: string;
  clearSelection: string;
};

export const zhCN: FileShelfText = {
  title: "文件中转",
  clear: "清空文件中转",
  confirmClear: "确认清空（不会删除文件）",
  empty: "把文件拖到岛上，就会暂存在这里",
  dropHint: "松开鼠标，加入文件中转",
  dragHint: "拖出到其他应用，双击打开，按住 Ctrl 或 Shift 点击可多选",
  folder: "文件夹",
  missing: "已失效",
  missingHint: "原文件已被移动、改名或删除",
  copyItem: "复制文件，可直接粘贴",
  copied: "已复制",
  reveal: "在文件夹中显示",
  removeItem: "从文件中转移除（不会删除文件）",
  alreadyOnShelf: "已在列表中",
  dragHintReveal: "拖出到其他应用，双击在文件夹中显示，按住 Ctrl 或 Shift 点击可多选",
  unreachable: "无法访问",
  unreachableHint: "所在的磁盘或网络位置暂时无法访问",
  pin: "置顶（不会被自动清理）",
  unpin: "取消置顶",
  searchPlaceholder: "搜索文件名或路径",
  searchLabel: "搜索文件中转",
  clearSearch: "清除搜索",
  emptySearch: "没有匹配的文件",
  selectedCount: (count) => `已选 ${count} 个`,
  copySelected: "复制所选文件",
  removeSelected: "从文件中转移除所选（不会删除文件）",
  clearSelection: "取消选择",
};

export const en: FileShelfText = {
  title: "File shelf",
  clear: "Clear shelf",
  confirmClear: "Confirm clear (files are kept)",
  empty: "Drop files on the island to keep them here",
  dropHint: "Release to add to the shelf",
  dragHint: "Drag out to another app, double-click to open, Ctrl- or Shift-click to select several",
  folder: "Folder",
  missing: "Missing",
  missingHint: "The original was moved, renamed or deleted",
  copyItem: "Copy the file to paste elsewhere",
  copied: "Copied",
  reveal: "Show in folder",
  removeItem: "Remove from shelf (the file is kept)",
  alreadyOnShelf: "Already on the shelf",
  dragHintReveal: "Drag out to another app, double-click to show in folder, Ctrl- or Shift-click to select several",
  unreachable: "Unavailable",
  unreachableHint: "Its drive or network location is not responding",
  pin: "Pin (kept by auto cleanup)",
  unpin: "Unpin",
  searchPlaceholder: "Search name or path",
  searchLabel: "Search the file shelf",
  clearSearch: "Clear search",
  emptySearch: "No matching files",
  selectedCount: (count) => `${count} selected`,
  copySelected: "Copy selected files",
  removeSelected: "Remove selected from shelf (files are kept)",
  clearSelection: "Clear selection",
};
