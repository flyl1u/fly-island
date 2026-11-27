export type WaterReminderText = {
  interval: string;
  duration: string;
  minutes: string;
  messages: string;
  messagesHint: (count: number, length: number) => string;
  saved: string;
  saveFailed: string;
  defaults: readonly string[];
};

export const zhCN: WaterReminderText = {
  interval: "提醒间隔",
  duration: "每次在岛上显示 5 秒。",
  minutes: "分钟",
  messages: "提醒文案",
  messagesHint: (count, length) => `每行一条，按顺序轮换。最多 ${count} 条，每条最多 ${length} 字。留空并保存可恢复默认文案。`,
  saved: "提醒文案已保存。",
  saveFailed: "无法保存喝水提醒设置。",
  defaults: [
    "已经很久没喝水了，喝杯水再继续吧！",
    "停一停，喝口水吧。",
    "水杯就在手边，记得喝一口。",
  ],
};

export const en: WaterReminderText = {
  interval: "Reminder interval",
  duration: "Each reminder appears on the island for 5 seconds.",
  minutes: "min",
  messages: "Reminder messages",
  messagesHint: (count, length) => `Enter one message per line. Messages rotate in order. Up to ${count} messages and ${length} characters per message. Save an empty list to restore the defaults.`,
  saved: "Reminder messages saved.",
  saveFailed: "Could not save water reminder settings.",
  defaults: [
    "It's been a while. Have a glass of water before you continue!",
    "Take a moment to sip some water.",
    "Water break! Reach for your glass.",
  ],
};
