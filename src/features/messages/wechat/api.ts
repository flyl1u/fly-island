import { invoke } from "@tauri-apps/api/core";
import { listen, type EventCallback } from "@tauri-apps/api/event";

// 与 src-tauri/src/wechat_reminders/mod.rs 中返回给前端的结构对应。
export type WeChatMessage = {
  id: string;
  receivedAt: number;
  contact: string;
  body: string;
};

export type WeChatPreviewStatus = "off" | "waiting" | "ready" | "tray" | "unsupported" | "unavailable";

export type ReminderSnapshot = {
  revision: number;
  enabled: boolean;
  status: "disabled" | "waiting" | "listening" | "error";
  pending: boolean;
  lastAttentionAt: number | null;
  error: string | null;
  previewEnabled: boolean;
  previewStatus: WeChatPreviewStatus;
  messages: WeChatMessage[];
};

export type ReminderEvent = { snapshot: ReminderSnapshot; windowVisible: boolean };

// 与 wechat_reminders/mod.rs 中推送的事件名一致。
export const WECHAT_REMINDER_CHANGED_EVENT = "wechat-reminder-changed";

export function getWeChatReminderState() {
  return invoke<ReminderSnapshot>("get_wechat_reminder_state");
}

export function setWeChatRemindersEnabled(enabled: boolean, previewEnabled?: boolean) {
  return invoke<ReminderSnapshot>("set_wechat_reminders_enabled", { enabled, previewEnabled });
}

export function setWeChatMessagePreviewEnabled(enabled: boolean) {
  return invoke<ReminderSnapshot>("set_wechat_message_preview_enabled", { enabled });
}

export function launchWeChat() {
  return invoke("open_wechat");
}

export function listenWeChatReminderChanged(handler: EventCallback<ReminderEvent>) {
  return listen<ReminderEvent>(WECHAT_REMINDER_CHANGED_EVENT, handler);
}
