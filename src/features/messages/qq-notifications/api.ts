import { invoke } from "@tauri-apps/api/core";
import { listen, type EventCallback } from "@tauri-apps/api/event";

// 与 src-tauri/src/qq_notifications/mod.rs 中返回给前端的结构对应。
export type QQNotification = {
  id: string;
  title: string;
  body: string;
  createdAt: number;
};

export type QQNotificationSnapshot = {
  revision: number;
  enabled: boolean;
  status: "disabled" | "waiting" | "listening" | "permissionDenied" | "permissionRequired" | "error";
  items: QQNotification[];
  error: string | null;
};

export type QQNotificationEvent = {
  snapshot: QQNotificationSnapshot;
  newestId: string | null;
  windowVisible: boolean;
};

// 与 qq_notifications/mod.rs 中的 EVENT_NAME 一致。
export const QQ_NOTIFICATIONS_CHANGED_EVENT = "qq-notifications-changed";

export function getQQNotificationState() {
  return invoke<QQNotificationSnapshot>("get_qq_notification_state");
}

export function setQQNotificationsEnabled(enabled: boolean) {
  return invoke<QQNotificationSnapshot>("set_qq_notifications_enabled", { enabled });
}

export function requestQQNotificationAccess() {
  return invoke<string>("request_qq_notification_access");
}

export function openQQNotificationSettings(access: boolean) {
  return invoke("open_qq_notification_settings", { access });
}

export function clearQQNotifications() {
  return invoke<QQNotificationSnapshot>("clear_qq_notifications");
}

/** Clears every notification of one contact or group (they share the toast title). */
export function dismissQQContact(title: string) {
  return invoke<QQNotificationSnapshot>("dismiss_qq_contact", { title });
}

export function launchQQ() {
  return invoke("open_qq");
}

export function listenQQNotificationsChanged(handler: EventCallback<QQNotificationEvent>) {
  return listen<QQNotificationEvent>(QQ_NOTIFICATIONS_CHANGED_EVENT, handler);
}
