export const ENABLED_KEY = "focusd-island-qq-notifications-enabled";
export const ACCESS_REQUESTED_KEY = "focusd-island-qq-notification-access-requested";

export function isQQNotificationsEnabled() {
  return window.localStorage.getItem(ENABLED_KEY) !== "false";
}

export function saveQQNotificationsEnabled(enabled: boolean) {
  window.localStorage.setItem(ENABLED_KEY, String(enabled));
}

export function hasRequestedQQNotificationAccess() {
  return window.localStorage.getItem(ACCESS_REQUESTED_KEY) === "true";
}

export function markQQNotificationAccessRequested() {
  window.localStorage.setItem(ACCESS_REQUESTED_KEY, "true");
}
