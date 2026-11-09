export const ENABLED_KEY = "focusd-island-wechat-reminders-enabled";

export function isWeChatRemindersEnabled() {
  return window.localStorage.getItem(ENABLED_KEY) !== "false";
}

export function saveWeChatRemindersEnabled(enabled: boolean) {
  window.localStorage.setItem(ENABLED_KEY, String(enabled));
}
