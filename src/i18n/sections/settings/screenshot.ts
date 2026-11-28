export type ScreenshotPluginText = {
  ocrModel: string; ocrDownloadHint: string; ocrInstalled: string; ocrDownload: string;
  ocrDownloading: string; ocrInstalledAction: string; ocrFailed: string;
  installedNeedsShortcut: string; shortcutIssueHint: (shortcut: string) => string; changeShortcut: string; useWithoutShortcut: string; actionFailed: string;
  title: string; back: string; enabled: string; disabledHint: string; shortcut: string; shortcutEnabled: string;
  captureNow: string; captureHint: string; tools: string; magnifier: string; snapping: string; hints: string;
  extensions: string; longCapture: string; recording: string; developing: string; performance: string; saveFailed: string;
};
export const zhCN: ScreenshotPluginText = {
  ocrModel: "增强文字识别", ocrDownloadHint: "默认使用 Windows 离线识别。可选下载约 30 MB 的中英文模型，下载后离线使用。",
  ocrInstalled: "增强模型已就绪，识别时自动使用。", ocrDownload: "下载模型", ocrDownloading: "正在下载…",
  ocrInstalledAction: "已下载", ocrFailed: "模型下载未完成，仍可使用系统识别。请重试。",
  installedNeedsShortcut: "截图已安装，需要设置快捷键", actionFailed: "操作未完成",
  shortcutIssueHint: (shortcut) => `快捷键 ${shortcut} 未能注册，截图暂未启用。换一个组合即可开启；也可以选择不用全局快捷键，改用“立即截图”。`,
  changeShortcut: "更换快捷键", useWithoutShortcut: "不用全局快捷键，启用截图",
  title: "截图设置", back: "返回插件", enabled: "启用截图插件", disabledHint: "停用后释放截图和贴图窗口，保留设置。",
  shortcut: "截图快捷键", shortcutEnabled: "启用全局快捷键", captureNow: "立即截图", captureHint: "默认 Alt+A，可录入其他组合；冲突时保留原快捷键。",
  tools: "截图辅助", magnifier: "显示像素放大镜", snapping: "自动选择鼠标下的窗口", hints: "显示操作提示",
  extensions: "扩展功能", longCapture: "长截图", recording: "录屏", developing: "开发中",
  performance: "使用时才创建截图窗口；连续截图短暂复用，空闲 30 秒后释放。文字识别模型按需加载，空闲 60 秒后释放。",
  saveFailed: "未能保存截图设置，请重试。",
};
export const en: ScreenshotPluginText = {
  ocrModel: "Enhanced text recognition", ocrDownloadHint: "Uses Windows offline OCR by default. Optionally download about 30 MB of Chinese/English models for offline use.",
  ocrInstalled: "Enhanced models are ready and will be used for recognition.", ocrDownload: "Download models", ocrDownloading: "Downloading…",
  ocrInstalledAction: "Downloaded", ocrFailed: "Download did not finish. System OCR is still available. Please retry.",
  installedNeedsShortcut: "Screenshot installed. Choose a shortcut", actionFailed: "Action could not be completed",
  shortcutIssueHint: (shortcut) => `${shortcut} could not be registered, so Screenshot is not enabled yet. Choose other keys to enable it, or use Capture now without a global shortcut.`,
  changeShortcut: "Change shortcut", useWithoutShortcut: "Enable without global shortcut",
  title: "Screenshot settings", back: "Back to plugins", enabled: "Enable screenshot plugin", disabledHint: "Disabling closes capture and pinned windows and keeps preferences.",
  shortcut: "Screenshot shortcut", shortcutEnabled: "Enable global shortcut", captureNow: "Capture now", captureHint: "Alt+A by default. Record another combination; conflicts keep the previous shortcut.",
  tools: "Capture assistance", magnifier: "Show pixel magnifier", snapping: "Select the window under the pointer", hints: "Show operation hints",
  extensions: "Extensions", longCapture: "Scrolling screenshot", recording: "Screen recording", developing: "In development",
  performance: "Capture windows are created on demand, reused briefly, and released after 30 idle seconds. OCR models load on demand and are released after 60 idle seconds.",
  saveFailed: "Could not save screenshot preferences. Please try again.",
};
