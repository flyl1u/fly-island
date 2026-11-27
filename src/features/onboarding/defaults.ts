import { FIRST_LAUNCH_SETTINGS } from "../appearance/index.ts";

/** Only preferences: no accounts, secrets, histories, machine paths or runtime state. */
export const FIRST_LAUNCH_STORAGE: Readonly<Record<string, string>> = {
  "fly-island-settings": JSON.stringify(FIRST_LAUNCH_SETTINGS),
  // Retired one-off refreshes must not overwrite a newly seeded profile.
  "fly-island-color-refresh-v1": "1",
  "fly-island-collapsed-text-default-v1": "1",
  "fly-island-locale": "zh-CN",
  "fly-island-detached-settings": "true",
  "fly-island-tray-visible": "true",
  "fly-island-auto-update": "true",
  "fly-island-clipboard-window-pinned": "true",
  "fly-island-qq-notifications-enabled": "true",
  "fly-island-wechat-reminders-enabled": "true",
  "fly-island-wechat-message-preview-enabled": "false",
  "fly-island-wechat-hide-minimized-taskbar": "false",
  "fly-island-office-im-enabled": JSON.stringify({ dingtalk: true, feishu: true, wecom: true }),
  "fly-island-native-plugins": JSON.stringify(["calendarMarks", "clockWeather", "antigravity", "battery"]),
  "fly-island-native-plugins-disabled": JSON.stringify(["battery"]),
  "fly-island-clock-weather": JSON.stringify({
    showClock: false,
    showWeather: true,
  }),
  "fly-island-agent-approval": JSON.stringify({ onIsland: true, whenInFront: false }),
  "fly-island-agent-sounds": JSON.stringify({ enabled: true }),
  "fly-island-todo-remind-minutes": "1",
  "fly-island-translation-settings": JSON.stringify({
    shortcut: "Alt+V", shortcutEnabled: true, direction: "auto", provider: "mymemory",
    customBaseUrl: "", models: {}, pasteClipboardOnOpen: true, autoTranslate: false,
  }),
};

export const FIRST_LAUNCH_CLIPBOARD = {
  enabled: true, captureImages: true, maxItems: 75, shortcut: "Alt+C", shortcutEnabled: true,
};
export const FIRST_LAUNCH_APP_LOG_ENABLED = true;
