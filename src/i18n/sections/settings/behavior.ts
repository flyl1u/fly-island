export type SettingsBehaviorText = {
  title: string;
  /** Settings open in their own window instead of as a page of the island. */
  detachedSettings: string;
  detachedSettingsHint: string;
  trayVisible: string;
  trayVisibleHint: string;
  traySaveFailed: string;
  trayUpdateFailed: (reason: string) => string;
};

export const zhCN: SettingsBehaviorText = {
  title: "启动与语言",
  detachedSettings: "独立设置窗口",
  detachedSettingsHint: "关闭时设置作为岛屿的一页打开",
  trayVisible: "在通知区域显示图标",
  trayVisibleHint: "隐藏后可在这里恢复，或再次启动 Fly Island 打开设置找回",
  traySaveFailed: "未能保存图标偏好，下次启动可能恢复显示",
  trayUpdateFailed: (reason) => `未能更改托盘图标：${reason}`,
};

export const en: SettingsBehaviorText = {
  title: "Startup & language",
  detachedSettings: "Separate settings window",
  detachedSettingsHint: "When off, settings open as a page of the island",
  trayVisible: "Show icon in the notification area",
  trayVisibleHint: "Restore it here, or launch Fly Island again to open settings",
  traySaveFailed: "Could not save this preference; the icon may reappear next time",
  trayUpdateFailed: (reason) => `Could not change the tray icon: ${reason}`,
};
