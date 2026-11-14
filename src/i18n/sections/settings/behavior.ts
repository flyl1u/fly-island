export type SettingsBehaviorText = {
  title: string;
  /** Settings open in their own window instead of as a page of the island. */
  detachedSettings: string;
  detachedSettingsHint: string;
};

export const zhCN: SettingsBehaviorText = {
  title: "启动与语言",
  detachedSettings: "独立设置窗口",
  detachedSettingsHint: "关闭时设置作为岛屿的一页打开",
};

export const en: SettingsBehaviorText = {
  title: "Startup & language",
  detachedSettings: "Separate settings window",
  detachedSettingsHint: "When off, settings open as a page of the island",
};
