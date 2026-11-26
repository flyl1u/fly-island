import { invoke } from "@tauri-apps/api/core";
import { listen, type EventCallback } from "@tauri-apps/api/event";

// Notice, Snapshot and NotificationEvent in telegram_notifications/mod.rs.
export type TelegramNotice = { id: string; title: string; body: string; createdAt: number };
export type TelegramSnapshot = {
  revision: number;
  enabled: boolean;
  status: "disabled" | "waiting" | "listening" | "permissionRequired" | "permissionDenied" | "error";
  items: TelegramNotice[];
  error: string | null;
};
type TelegramEvent = { snapshot: TelegramSnapshot; newestId: string | null };
const TELEGRAM_CHANGED = "telegram-notifications-changed";

export const getTelegramNotifications = () => invoke<TelegramSnapshot>("get_telegram_notification_state");
export const setTelegramEnabled = (enabled: boolean) =>
  invoke<TelegramSnapshot>("set_telegram_notifications_enabled", { enabled });
export const activateTelegramNotice = (id: string) =>
  invoke<TelegramSnapshot>("open_telegram_notification", { id });
export const launchTelegram = () => invoke<void>("open_telegram");
export const requestTelegramAccess = () => invoke<void>("request_telegram_notification_access");
export const openTelegramAccessSettings = () => invoke<void>("open_telegram_notification_settings");
export const listenTelegramNotifications = (onEvent: EventCallback<TelegramEvent>) =>
  listen(TELEGRAM_CHANGED, onEvent);
