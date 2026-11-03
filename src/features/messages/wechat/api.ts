import { invoke } from "@tauri-apps/api/core";
import { listen, type EventCallback } from "@tauri-apps/api/event";

// 与 src-tauri/src/wechat_reminders.rs 中返回给前端的结构对应。
export type ReminderSnapshot = {
  revision: number;
  enabled: boolean;
  status: "disabled" | "waiting" | "listening" | "error";
  pending: boolean;
  lastAttentionAt: number | null;
  error: string | null;
};

export type ReminderEvent = { snapshot: ReminderSnapshot; windowVisible: boolean };

// 与 wechat_reminders.rs 中推送的事件名一致。
export const WECHAT_REMINDER_CHANGED_EVENT = "wechat-reminder-changed";

export function setWeChatRemindersEnabled(enabled: boolean) {
  return invoke<ReminderSnapshot>("set_wechat_reminders_enabled", { enabled });
}

export function launchWeChat() {
  return invoke("open_wechat");
}

export function listenWeChatReminderChanged(handler: EventCallback<ReminderEvent>) {
  return listen<ReminderEvent>(WECHAT_REMINDER_CHANGED_EVENT, handler);
}
