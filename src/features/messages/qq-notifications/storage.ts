import { readString, writeString } from "../../../lib/storage.ts";
export const ENABLED_KEY = "focusd-island-qq-notifications-enabled";
export const ACCESS_REQUESTED_KEY = "focusd-island-qq-notification-access-requested";

export function isQQNotificationsEnabled() {
  return readString(ENABLED_KEY) !== "false";
}

export function saveQQNotificationsEnabled(enabled: boolean) {
  writeString(ENABLED_KEY, String(enabled));
}

export function hasRequestedQQNotificationAccess() {
  return readString(ACCESS_REQUESTED_KEY) === "true";
}

export function markQQNotificationAccessRequested() {
  writeString(ACCESS_REQUESTED_KEY, "true");
}
