import { invoke } from "@tauri-apps/api/core";
import { listen, type EventCallback } from "@tauri-apps/api/event";

// 与 src-tauri/src/qq_mail.rs 中返回给前端的结构对应。
export type MailMessage = {
  id: string;
  uid: number;
  sender: string;
  subject: string;
  receivedAt: number | null;
  unread: boolean;
};

export type MailContent = { id: string; content: string; contentType: "text/plain" | "text/html" };

export type MailSnapshot = {
  revision: number;
  email: string | null;
  configured: boolean;
  enabled: boolean;
  syncing: boolean;
  status: "disconnected" | "connecting" | "connected" | "paused" | "authRequired" | "error";
  unreadCount: number | null;
  items: MailMessage[];
  lastSyncedAt: number | null;
  error: string | null;
};

export type MailEvent = { snapshot: MailSnapshot; newestId: string | null; windowVisible: boolean };

// 与 qq_mail.rs 中的 EVENT 一致。
export const QQ_MAIL_CHANGED_EVENT = "qq-mail-changed";

export type QQMailCommand = "connect_qq_mail" | "set_qq_mail_enabled" | "refresh_qq_mail" | "disconnect_qq_mail";

export function getQQMailState() {
  return invoke<MailSnapshot>("get_qq_mail_state");
}

export function invokeQQMailCommand(command: QQMailCommand, args?: Record<string, unknown>) {
  return invoke<MailSnapshot>(command, args);
}

export function readQQMail(messageId: string) {
  return invoke<MailContent>("read_qq_mail", { messageId });
}

export function listenQQMailChanged(handler: EventCallback<MailEvent>) {
  return listen<MailEvent>(QQ_MAIL_CHANGED_EVENT, handler);
}
