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
