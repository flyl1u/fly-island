import { readString, writeString } from "../../../lib/storage";

export const ENABLED_KEY = "focusd-island-wechat-reminders-enabled";
const PREVIEW_KEY = "focusd-island-wechat-message-preview-enabled";
const HIDE_MINIMIZED_TASKBAR_KEY = "focusd-island-wechat-hide-minimized-taskbar";

export function isWeChatRemindersEnabled() {
  return readString(ENABLED_KEY) !== "false";
}

export function saveWeChatRemindersEnabled(enabled: boolean) {
  writeString(ENABLED_KEY, String(enabled));
}

export function isWeChatMessagePreviewEnabled() {
  return readString(PREVIEW_KEY) === "true";
}

export function saveWeChatMessagePreviewEnabled(enabled: boolean) {
  writeString(PREVIEW_KEY, String(enabled));
}

export function isWeChatMinimizedTaskbarHidden() {
  return readString(HIDE_MINIMIZED_TASKBAR_KEY) === "true";
}

export function saveWeChatMinimizedTaskbarHidden(hidden: boolean) {
  writeString(HIDE_MINIMIZED_TASKBAR_KEY, String(hidden));
}
