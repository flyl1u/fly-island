export type FileShelfText = {
  title: string;
  /** The note a new user finds on the shelf: its file name (without .txt) and its text. */
  welcomeFileName: string;
  welcomeContent: string;
  clear: string;
  confirmClear: string;
  empty: string;
  /** Under the empty message: the shelf keeps references, not copies. */
  emptyNote: string;
  /** Under the tiles: how to take files back out. */
  footerHint: (reveal: boolean) => string;
  dropHint: string;
  /** The open place after a few tiles, where more files can be dropped. */
  moreSlot: string;
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
  welcomeFileName: "欢迎使用文件中转",
  welcomeContent: `你好！这里是文件中转。

把文件或文件夹拖到小岛上，它们会先放在这里；需要的时候再从这里拖到别的窗口、聊天框或文件夹里。

文件中转只记下文件的位置，不会复制或移动文件本身。
看完可以把这个文件移出中转，它不会再出现。
`,
  clear: "清空文件中转",
  confirmClear: "确认清空（不会删除文件）",
  empty: "把文件拖到岛上，就会暂存在这里",
  emptyNote: "只记住位置，不复制文件；移除也不会删掉原文件",
  footerHint: (reveal) => `拖出复制，列表保留 · Shift 移动 · 双击${reveal ? "在文件夹中显示" : "打开"}`,
  dropHint: "松开鼠标，加入文件中转",
  moreSlot: "还能再放",
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
  welcomeFileName: "Welcome to the file shelf",
  welcomeContent: `Hi! This is the file shelf.

Drop files or folders on the island to park them here, then drag them out into another window, a chat or a folder when you need them.

The shelf only remembers where files are; it never copies or moves them.
Remove this note from the shelf once you have read it; it will not come back.
`,
  clear: "Clear shelf",
  confirmClear: "Confirm clear (files are kept)",
  empty: "Drop files on the island to keep them here",
  emptyNote: "Only the location is kept, never a copy; removing leaves the file alone",
  footerHint: (reveal) => `Drag to copy; kept on shelf · Shift to move · Double-click to ${reveal ? "show in folder" : "open"}`,
  dropHint: "Release to add to the shelf",
  moreSlot: "Room for more",
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
