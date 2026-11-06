import { invoke } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";

/** Opens a meeting's join link (only links of known meeting services ever reach here). */
export function openMeetingLink(link: string) {
  return openUrl(link);
}

/** Mirrors CalendarEvent in src-tauri/src/calendar/ics.rs: one occurrence of an event. */
export type CalendarEvent = {
  uid: string;
  title: string;
  /** Unix ms; an all-day event runs from local midnight to local midnight. */
  startMs: number;
  endMs: number;
  allDay: boolean;
  location: string | null;
  /** A join link of a known meeting service (Tencent Meeting, Feishu, Zoom, Teams, ...). */
  meetingLink: string | null;
  /** The name of the calendar it came from. */
  calendar: string;
};

/** Mirrors CalendarSnapshot in src-tauri/src/calendar/mod.rs. */
export type CalendarSnapshot = {
  /** Today's and tomorrow's events, by start. */
  events: CalendarEvent[];
  /** Calendars that could not be read this time. */
  problems: { sourceId: string; message: string }[];
  fetchedAt: number;
  /** How many calendars are added; none hides the calendar page. */
  sourceCount: number;
};

export type CalendarSourceKind = "ics" | "caldav";

/** Mirrors CalendarSource in src-tauri/src/calendar/sources.rs; the secret is never sent back. */
export type CalendarSource = {
  id: string;
  kind: CalendarSourceKind;
  name: string;
  /** The CalDAV address; empty for an ICS link. */
  url: string;
  host: string;
  username: string;
};

/** Read again natively every 15 minutes; `refresh` reads now. */
export function getCalendarEvents(refresh = false) {
  return invoke<CalendarSnapshot>("get_calendar_events", { refresh });
}

export function listCalendarSources() {
  return invoke<CalendarSource[]>("list_calendar_sources");
}

/** Reads the calendar once and keeps it only if that works. `secret`: the ICS link or the CalDAV password. */
export function addCalendarSource(source: { kind: CalendarSourceKind; name: string; url: string; username: string; secret: string }) {
  return invoke<CalendarSource>("add_calendar_source", source);
}

export function removeCalendarSource(id: string) {
  return invoke<void>("remove_calendar_source", { id });
}
