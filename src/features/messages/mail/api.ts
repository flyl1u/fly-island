import { invoke } from "@tauri-apps/api/core";
import { listen, type EventCallback } from "@tauri-apps/api/event";

// 与 src-tauri/src/mail/mod.rs 中返回给前端的结构对应。
export type MailMessage = {
  id: string;
  uid: number;
  sender: string;
  subject: string;
  receivedAt: number | null;
  unread: boolean;
};

/** Mirrors AttachmentInfo in src-tauri/src/mail/attachments.rs. */
export type MailAttachment = { part: string; name: string; size: number; mime: string };

export type MailContent = { id: string; content: string; contentType: "text/plain" | "text/html"; attachments: MailAttachment[] };

/** Saves one attachment into Downloads and shows it in Explorer; resolves to the path written. */
export function saveMailAttachment(email: string, messageId: string, part: string) {
  return invoke<string>("save_qq_mail_attachment", { email, messageId, part });
}

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

// 每个邮箱各自推送；断开或首次连接失败的邮箱推送 configured: false、status: "disconnected"。
export type MailEvent = { snapshot: MailSnapshot; newestId: string | null; windowVisible: boolean };

// 与 mail/mod.rs 中的 EVENT 一致。
export const MAIL_CHANGED_EVENT = "qq-mail-changed";

export type MailCommand = "connect_qq_mail" | "set_qq_mail_enabled" | "refresh_qq_mail" | "disconnect_qq_mail" | "mark_qq_mail_read";

/** One snapshot per mailbox the backend knows, in no particular order. */
export function getMailState() {
  return invoke<MailSnapshot[]>("get_qq_mail_state");
}

export function invokeMailCommand(command: MailCommand, args?: Record<string, unknown>) {
  return invoke<MailSnapshot>(command, args);
}

export function readMailContent(email: string, messageId: string) {
  return invoke<MailContent>("read_qq_mail", { email, messageId });
}

export function listenMailChanged(handler: EventCallback<MailEvent>) {
  return listen<MailEvent>(MAIL_CHANGED_EVENT, handler);
}
