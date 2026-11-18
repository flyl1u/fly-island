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
};

export const zhCN: SettingsSaveText = {
  title: "待办清单保存路径",
  folder: "文件夹",
  folderLabel: "待办清单 Markdown 保存文件夹",
  folderPlaceholder: "D:/Todos",
  saved: "已保存",
  save: "保存",
  browse: "选择文件夹",
  browseTitle: "选择待办清单保存文件夹",
  browseFailed: "无法打开文件夹选择窗口",
};

export const en: SettingsSaveText = {
  title: "Task list save path",
  folder: "Folder",
  folderLabel: "Markdown folder for task list",
  folderPlaceholder: "D:/Todos",
  saved: "Saved",
  save: "Save",
  browse: "Choose folder",
  browseTitle: "Choose a folder for the task list",
  browseFailed: "Couldn't open the folder picker",
};
