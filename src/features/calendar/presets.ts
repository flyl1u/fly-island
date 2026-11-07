import type { CalendarSourceKind } from "./api";

/** Calendar services the add form knows, so the user picks a name rather than a protocol. */
export type CalendarService = "feishu" | "dingtalk" | "wecom" | "icloud" | "google" | "outlook" | "other";

export type CalendarPreset = {
  service: CalendarService;
  kind: CalendarSourceKind;
  /** The CalDAV server filled in for the user; empty when the user has to type it. */
  server: string;
};

/** In the order the form lists them. WeCom shows its server next to the account, so it is typed. */
export const CALENDAR_PRESETS: readonly CalendarPreset[] = [
  { service: "feishu", kind: "caldav", server: "https://caldav.feishu.cn" },
  { service: "dingtalk", kind: "caldav", server: "https://calendar.dingtalk.com" },
  { service: "wecom", kind: "caldav", server: "" },
  { service: "icloud", kind: "caldav", server: "https://caldav.icloud.com" },
  { service: "google", kind: "ics", server: "" },
  { service: "outlook", kind: "ics", server: "" },
  { service: "other", kind: "caldav", server: "" },
];

export function presetOf(service: CalendarService): CalendarPreset {
  return CALENDAR_PRESETS.find((preset) => preset.service === service) ?? CALENDAR_PRESETS[CALENDAR_PRESETS.length - 1];
}

/** Whether the form asks for the server address: only when no preset fills it. */
export function needsServer(preset: CalendarPreset, kind: CalendarSourceKind) {
  return kind === "caldav" && preset.server === "";
}

/** Apple's public calendar of mainland China's holidays and make-up workdays; no account needed. */
export const CHINA_HOLIDAYS_LINK = "https://calendars.icloud.com/holidays/cn_zh.ics";

/** What a pasted link most likely is: an iCalendar subscription when it says so, else a server. */
export function guessKind(link: string): CalendarSourceKind {
  const text = link.trim().toLowerCase();
  return text.startsWith("webcal://") || text.includes(".ics") || text.includes("/ical/") ? "ics" : "caldav";
}
