export type SettingsDiagnosticsText = {
  title: string;
  enable: string;
  enableHint: string;
  file: string;
  fileHint: (size: string) => string;
  open: string;
  clear: string;
  exportTitle: string;
  exportButton: string;
  exportHint: string;
  exporting: string;
  exportSaved: (path: string) => string;
  exportFailed: string;
};

export const zhCN: SettingsDiagnosticsText = {
  title: "问题排查",
  enable: "记录日志",
  enableHint: "开启后将诊断事件持续保存到本机。关闭时仍在内存中保留最近的事件，退出应用后清除。",
  file: "日志文件",
  fileHint: (size) => `当前 ${size}，最多约 10 MB`,
  open: "打开文件夹",
  clear: "清空",
  exportTitle: "诊断包",
  exportButton: "导出诊断包…",
  exportHint: "即使未开启日志，也可导出最近的事件。文件不会自动上传。",
  exporting: "正在导出诊断包…",
  exportSaved: (path) => "诊断包已保存到：" + path,
  exportFailed: "未能保存诊断包，请选择有写入权限的位置后重试。",
};

export const en: SettingsDiagnosticsText = {
  title: "Troubleshooting",
  enable: "Record a log",
  enableHint: "Save diagnostic events on this device. When off, recent events stay in memory until you quit.",
  file: "Log file",
  fileHint: (size) => `${size} now, about 10 MB at most`,
  open: "Open folder",
  clear: "Clear",
  exportTitle: "Diagnostic bundle",
  exportButton: "Export diagnostic bundle…",
  exportHint: "Export recent events even when recording is off. Nothing is uploaded automatically.",
  exporting: "Exporting diagnostic bundle…",
  exportSaved: (path) => "Diagnostic bundle saved to: " + path,
  exportFailed: "Could not save the diagnostic bundle. Choose a writable folder and try again.",
};
