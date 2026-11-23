export type SettingsSaveText = {
  title: string;
  folder: string;
  folderLabel: string;
  folderPlaceholder: string;
  saved: string;
  save: string;
  browse: string;
  browseTitle: string;
  browseFailed: string;
  fileSync: string;
  fileSyncDescription: string;
  fileSyncNeedsPath: string;
};

export const zhCN: SettingsSaveText = {
  title: "保存路径",
  folder: "文件夹",
  folderLabel: "待办清单 Markdown 保存文件夹",
  folderPlaceholder: "D:/Todos",
  saved: "已保存",
  save: "保存",
  browse: "选择文件夹",
  browseTitle: "选择待办清单保存文件夹",
  browseFailed: "无法打开文件夹选择窗口",
  fileSync: "从文件同步回岛上",
  fileSyncDescription: "打开后，在外部编辑当天的 Markdown 文件，岛上的待办和笔记会跟着更新。",
  fileSyncNeedsPath: "请先保存一个文件夹路径，再开启反向同步。",
};

export const en: SettingsSaveText = {
  title: "Save location",
  folder: "Folder",
  folderLabel: "Markdown folder for task list",
  folderPlaceholder: "D:/Todos",
  saved: "Saved",
  save: "Save",
  browse: "Choose folder",
  browseTitle: "Choose a folder for the task list",
  browseFailed: "Couldn't open the folder picker",
  fileSync: "Sync file edits back to the island",
  fileSyncDescription: "When on, editing today's Markdown file updates the island's todos and daily note.",
  fileSyncNeedsPath: "Save a folder path first to enable file sync.",
};
