import type { CalendarEvent } from "./api";

/** A meeting the collapsed island counts down to, or one just started. */
export type UpcomingMeeting = {
  event: CalendarEvent;
  /** Whole minutes until it starts (at least 1), or 0 once it has started. */
  minutes: number;
};

/** What the collapsed bar gets: the meeting, and whether to name it. */
export type CollapsedMeeting = { upcoming: UpcomingMeeting; showTitle: boolean };

/** A started meeting stays on the bar this long, so a late joiner still finds its link. */
export const STARTED_HOLD_MS = 5 * 60_000;

/**
 * The meeting to show on the collapsed island at `now`: the soonest timed event that starts
 * within `remindMinutes`, or one that started less than five minutes ago. All-day events and
 * events of no length do not count as meetings. Null with `remindMinutes` 0.
 */
export function upcomingMeeting(events: readonly CalendarEvent[], now: number, remindMinutes: number): UpcomingMeeting | null {
  if (remindMinutes <= 0) return null;
  const window = remindMinutes * 60_000;
  const candidates = events.filter(
    (event) => !event.allDay && event.endMs > event.startMs && event.startMs - now <= window && now - event.startMs < STARTED_HOLD_MS && now < event.endMs,
  );
  // One about to start beats one already going.
  const soonest =
    candidates.filter((event) => event.startMs > now).sort((a, b) => a.startMs - b.startMs)[0] ??
    candidates.sort((a, b) => b.startMs - a.startMs)[0];
  if (!soonest) return null;
  return { event: soonest, minutes: soonest.startMs > now ? Math.max(1, Math.ceil((soonest.startMs - now) / 60_000)) : 0 };
}

/** When what `upcomingMeeting` returns next changes: the next minute, a start, or a hold ending. */
export function nextChangeAt(events: readonly CalendarEvent[], now: number, remindMinutes: number): number | null {
  if (remindMinutes <= 0) return null;
  const window = remindMinutes * 60_000;
  const times = events
    .filter((event) => !event.allDay)
    .flatMap((event) => [event.startMs - window, event.startMs, event.startMs + STARTED_HOLD_MS, event.endMs])
    .filter((at) => at > now);
  const soonest = times.length > 0 ? Math.min(...times) : null;
  const showing = upcomingMeeting(events, now, remindMinutes);
  // While counting down, the minutes change every minute.
  const nextMinute = showing && showing.minutes > 0 ? now + (((showing.event.startMs - now) % 60_000) || 60_000) : null;
  const all = [soonest, nextMinute].filter((at): at is number => at !== null);
  return all.length > 0 ? Math.min(...all) : null;
}

/** "HH:mm" in this computer's time. */
export function clockTime(ms: number) {
  const date = new Date(ms);
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

/** Whether `ms` falls on the same local day as `day`. */
export function sameDay(ms: number, day: number) {
  return new Date(ms).toDateString() === new Date(day).toDateString();
}
