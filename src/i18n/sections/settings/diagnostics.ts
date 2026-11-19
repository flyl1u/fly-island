export type SettingsDiagnosticsText = {
  title: string;
  enable: string;
  enableHint: string;
  file: string;
  fileHint: (size: string) => string;
  open: string;
  clear: string;
};

export const zhCN: SettingsDiagnosticsText = {
  title: "问题排查",
  enable: "记录日志",
  enableHint: "遇到问题时打开，再操作一遍，把日志文件发到交流群。日志只保存在这台电脑上",
  file: "日志文件",
  fileHint: (size) => `当前 ${size}，最多约 4 MB`,
  open: "打开文件夹",
  clear: "清空",
};

export const en: SettingsDiagnosticsText = {
  title: "Troubleshooting",
  enable: "Record a log",
  enableHint: "Turn on when something goes wrong, do it again, then send the log file to the group. It stays on this computer",
  file: "Log file",
  fileHint: (size) => `${size} now, about 4 MB at most`,
  open: "Open folder",
  clear: "Clear",
};
