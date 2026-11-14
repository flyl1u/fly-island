export type ClipboardText = {
  pinWindow: string;
  unpinWindow: string;
  moveWindow: string;
  closeWindow: string;
  windowActionFailed: string;
  selectEntries: string;
  selectItem: (preview: string) => string;
  selectAll: string;
  deselectAll: string;
  finishSelection: string;
  deleteSelected: (count: number) => string;
  deleteFailed: string;
  imagePreview: string;
  closePreview: string;
  loadingImage: string;
  previewFailed: string;
  imageSize: (width: number, height: number) => string;
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
  pinWindow: "让窗口保持在最上面",
  unpinWindow: "取消窗口置顶",
  moveWindow: "拖动窗口",
  closeWindow: "关闭剪贴板窗口",
  windowActionFailed: "窗口操作失败，请重试",
  selectEntries: "选择记录",
  selectItem: (preview) => `选择记录：${preview}`,
  selectAll: "全选",
  deselectAll: "取消全选",
  finishSelection: "完成选择",
  deleteSelected: (count) => `删除已选的 ${count} 条记录`,
  deleteFailed: "删除失败，请再试一次",
  imagePreview: "预览图片",
  closePreview: "关闭预览",
  loadingImage: "正在加载原图…",
  previewFailed: "原图未能加载，暂时显示缩略图",
  imageSize: (width, height) => `${width} × ${height} 像素`,
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
  pinWindow: "Keep window on top",
  unpinWindow: "Unpin window",
  moveWindow: "Move window",
  closeWindow: "Close clipboard window",
  windowActionFailed: "Window action failed. Try again.",
  selectEntries: "Select entries",
  selectItem: (preview) => `Select entry: ${preview}`,
  selectAll: "Select all",
  deselectAll: "Deselect all",
  finishSelection: "Done selecting",
  deleteSelected: (count) => `Delete ${count} selected`,
  deleteFailed: "Couldn't delete. Try again.",
  imagePreview: "Preview image",
  closePreview: "Close preview",
  loadingImage: "Loading full image…",
  previewFailed: "Full image unavailable. Showing thumbnail.",
  imageSize: (width, height) => `${width} × ${height} px`,
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
