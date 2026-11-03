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
