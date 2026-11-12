import { readString, writeString } from "../../../lib/storage";

export const ENABLED_KEY = "focusd-island-wechat-reminders-enabled";
const PREVIEW_KEY = "focusd-island-wechat-message-preview-enabled";

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
