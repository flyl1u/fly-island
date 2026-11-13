/** Uses local calendar dates, including across DST and year boundaries. */
export function formatMessageCardTime(timestamp: number, now: number, yesterdayLabel: string): string {
  const date = new Date(timestamp);
  if (!Number.isFinite(date.getTime())) return "";
  const today = new Date(now);
  const yesterday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1);
  const sameDay = (other: Date) => date.getFullYear() === other.getFullYear() && date.getMonth() === other.getMonth() && date.getDate() === other.getDate();
  const pad = (value: number) => String(value).padStart(2, "0");
  const time = `${pad(date.getHours())}:${pad(date.getMinutes())}`;
  if (sameDay(today)) return time;
  if (sameDay(yesterday)) return `${yesterdayLabel} ${time}`;
  return `${pad(date.getMonth() + 1)}/${pad(date.getDate())} ${time}`;
}

/** Reject URL schemes, timestamps and multiline prefixes rather than guessing a sender. */
export function splitMessageSender(body: string): { sender: string; content: string; separator: string } | null {
  const match = /^([^：:\r\n]{1,24})([：:])([\s\S]+)$/u.exec(body);
  if (!match) return null;
  const sender = match[1].trim();
  const content = match[3];
  if (!sender || !content.trim() || content.startsWith("//") || /^\d+$/.test(sender)) return null;
  return { sender: match[1], separator: match[2], content };
}
