import { useCallback, useEffect, useMemo, useState } from "react";
import { getCalendarEvents, type CalendarSnapshot } from "./api";
import { nextChangeAt, upcomingMeeting, type UpcomingMeeting } from "./upcoming";

/** How often the island asks; the native side reads the calendars again only every 15 minutes. */
const POLL_MS = 60_000;

export const EMPTY_CALENDAR: CalendarSnapshot = { events: [], problems: [], fetchedAt: 0, sourceCount: 0 };

function isSnapshot(value: unknown): value is CalendarSnapshot {
  const snapshot = value as CalendarSnapshot | null;
  return Boolean(snapshot) && Array.isArray(snapshot?.events) && Array.isArray(snapshot?.problems) && typeof snapshot?.sourceCount === "number";
}

export type CalendarState = {
  snapshot: CalendarSnapshot;
  /** The meeting the collapsed island counts down to, or null. */
  upcoming: UpcomingMeeting | null;
  /** The time `upcoming` was worked out for; the page marks past events by it. */
  now: number;
  /** Reads the calendars now (the page opened, or the user asked). */
  refresh: () => void;
};

/** Today's and tomorrow's events while the calendar module is on, and the next meeting. */
export function useCalendar(enabled: boolean, remindMinutes: number): CalendarState {
  const [snapshot, setSnapshot] = useState<CalendarSnapshot>(EMPTY_CALENDAR);
  const [now, setNow] = useState(() => Date.now());

  const load = useCallback(async (refresh: boolean) => {
    try {
      const next = await getCalendarEvents(refresh);
      setSnapshot(isSnapshot(next) ? next : EMPTY_CALENDAR);
      setNow(Date.now());
    } catch (error) {
      console.error("Failed to read the calendars", error);
    }
  }, []);

  useEffect(() => {
    if (!enabled) {
      setSnapshot(EMPTY_CALENDAR);
      return;
    }
    void load(false);
    const timer = window.setInterval(() => void load(false), POLL_MS);
    return () => window.clearInterval(timer);
  }, [enabled, load]);

  // Wake when the countdown's minute, a start or an end comes, rather than every second.
  useEffect(() => {
    const at = nextChangeAt(snapshot.events, now, remindMinutes);
    if (at === null) return;
    const timer = window.setTimeout(() => setNow(Date.now()), Math.max(0, at - Date.now()) + 50);
    return () => window.clearTimeout(timer);
  }, [now, remindMinutes, snapshot.events]);

  const upcoming = useMemo(() => upcomingMeeting(snapshot.events, now, remindMinutes), [now, remindMinutes, snapshot.events]);
  const refresh = useCallback(() => void load(true), [load]);
  return useMemo(() => ({ snapshot, upcoming, now, refresh }), [now, refresh, snapshot, upcoming]);
}
