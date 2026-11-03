// 与 src-tauri/src/qq_notifications.rs 中返回给前端的结构对应。
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
