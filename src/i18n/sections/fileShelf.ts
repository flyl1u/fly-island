export type FileShelfText = {
  title: string;
  clear: string;
  confirmClear: string;
  empty: string;
  /** Under the empty message: the shelf keeps references, not copies. */
  emptyNote: string;
  /** Under the tiles: how to take files back out. */
  footerHint: (reveal: boolean) => string;
  dropHint: string;
  folder: string;
  missing: string;
  copyItem: string;
  copied: string;
  reveal: string;
  removeItem: string;
  alreadyOnShelf: string;
  unreachable: string;
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
  emptyNote: "只记住位置，不复制文件；移除也不会删掉原文件",
  footerHint: (reveal) => `拖到别的窗口就是复制，按住 Shift 是移动 · 双击${reveal ? "在文件夹中显示" : "打开"}`,
  dropHint: "松开鼠标，加入文件中转",
  folder: "文件夹",
  missing: "已失效",
  copyItem: "复制文件，可直接粘贴",
  copied: "已复制",
  reveal: "在文件夹中显示",
  removeItem: "从文件中转移除（不会删除文件）",
  alreadyOnShelf: "已在列表中",
  unreachable: "无法访问",
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
  emptyNote: "Only the location is kept, never a copy; removing leaves the file alone",
  footerHint: (reveal) => `Drag into another window to copy, hold Shift to move · Double-click to ${reveal ? "show in folder" : "open"}`,
  dropHint: "Release to add to the shelf",
  folder: "Folder",
  missing: "Missing",
  copyItem: "Copy the file to paste elsewhere",
  copied: "Copied",
  reveal: "Show in folder",
  removeItem: "Remove from shelf (the file is kept)",
  alreadyOnShelf: "Already on the shelf",
  unreachable: "Unavailable",
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
