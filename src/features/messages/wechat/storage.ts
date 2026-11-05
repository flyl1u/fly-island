import { readString, writeString } from "../../../lib/storage.ts";
export const ENABLED_KEY = "focusd-island-wechat-reminders-enabled";

export function isWeChatRemindersEnabled() {
  return readString(ENABLED_KEY) !== "false";
}

export function saveWeChatRemindersEnabled(enabled: boolean) {
  writeString(ENABLED_KEY, String(enabled));
}
