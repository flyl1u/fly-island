export type SettingsSaveText = {
  title: string;
  folder: string;
  folderLabel: string;
  folderPlaceholder: string;
  saved: string;
  save: string;
};

export const zhCN: SettingsSaveText = {
  title: "待办清单保存路径",
  folder: "文件夹",
  folderLabel: "待办清单 Markdown 保存文件夹",
  folderPlaceholder: "D:/Todos",
  saved: "已保存",
  save: "保存",
};

export const en: SettingsSaveText = {
  title: "Task list save path",
  folder: "Folder",
  folderLabel: "Markdown folder for task list",
  folderPlaceholder: "D:/Todos",
  saved: "Saved",
  save: "Save",
};
