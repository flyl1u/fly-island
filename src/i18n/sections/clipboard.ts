export type ClipboardText = {
  title: string;
  favoriteCount: (count: number) => string;
  expandShortcut: string;
  clear: string;
  confirmClear: string;
  clearHistory: string;
  segments: string;
  all: string;
  favorites: string;
  searchPlaceholder: string;
  searchLabel: string;
  clearSearch: string;
  emptyAll: string;
  emptyFavorites: string;
  emptySearch: string;
  copyBack: string;
  copy: string;
  copied: string;
  favorite: string;
  favoriteItem: string;
  unfavoriteItem: string;
  delete: string;
  deleteItem: string;
  notePlaceholder: string;
  noteInputLabel: string;
  saveNote: string;
  cancelEditNote: string;
  editNote: (note: string) => string;
  editNoteLabel: string;
  addNoteLabel: string;
  noteFallback: string;
};

export const zhCN: ClipboardText = {
  title: "剪贴板历史",
  favoriteCount: (count) => `${count} 条收藏`,
  expandShortcut: "展开快捷键",
  clear: "清空",
  confirmClear: "确认清空",
  clearHistory: "清空剪贴板历史",
  segments: "剪贴板栏目",
  all: "全部",
  favorites: "收藏",
  searchPlaceholder: "搜索内容或备注",
  searchLabel: "搜索剪贴板内容或备注",
  clearSearch: "清除搜索",
  emptyAll: "复制文本或图片后会出现在这里",
  emptyFavorites: "还没有收藏剪贴记录",
  emptySearch: "没有匹配的剪贴记录",
  copyBack: "复制回剪贴板",
  copy: "复制",
  copied: "已复制",
  favorite: "收藏",
  favoriteItem: "收藏剪贴记录",
  unfavoriteItem: "取消收藏剪贴记录",
  delete: "删除",
  deleteItem: "删除剪贴记录",
  notePlaceholder: "备注这是什么",
  noteInputLabel: "剪贴记录备注",
  saveNote: "保存备注",
  cancelEditNote: "取消编辑备注",
  editNote: (note) => `编辑备注：${note}`,
  editNoteLabel: "添加剪贴记录备注",
  addNoteLabel: "添加剪贴记录备注",
  noteFallback: "备注",
};

export const en: ClipboardText = {
  title: "Clipboard history",
  favoriteCount: (count) => (count === 1 ? "1 favorite" : `${count} favorites`),
  expandShortcut: "Expand shortcut",
  clear: "Clear",
  confirmClear: "Confirm clear",
  clearHistory: "Clear clipboard history",
  segments: "Clipboard tabs",
  all: "All",
  favorites: "Starred",
  searchPlaceholder: "Search content or note",
  searchLabel: "Search clipboard content or note",
  clearSearch: "Clear search",
  emptyAll: "Copied text and images show up here",
  emptyFavorites: "No starred entries yet",
  emptySearch: "No matching entries",
  copyBack: "Copy back to clipboard",
  copy: "Copy",
  copied: "Copied",
  favorite: "Star",
  favoriteItem: "Star entry",
  unfavoriteItem: "Unstar entry",
  delete: "Delete",
  deleteItem: "Delete entry",
  notePlaceholder: "Note what this is",
  noteInputLabel: "Clipboard entry note",
  saveNote: "Save note",
  cancelEditNote: "Cancel editing note",
  editNote: (note) => `Edit note: ${note}`,
  editNoteLabel: "Add note to clipboard entry",
  addNoteLabel: "Add note to clipboard entry",
  noteFallback: "Note",
};
