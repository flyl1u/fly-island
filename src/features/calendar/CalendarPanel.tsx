import { useEffect } from "react";
import { RefreshCcw, Settings, Video } from "lucide-react";
import { useTranslation } from "../../i18n";
import { openMeetingLink, type CalendarEvent, type CalendarSnapshot } from "./api";
import { clockTime, sameDay } from "./upcoming";
import "./CalendarPanel.css";

function join(link: string) {
  void openMeetingLink(link).catch((error: unknown) => console.error("Failed to open the meeting link", error));
}

/**
 * The island's calendar page: today's and tomorrow's events, each with its time, title and
 * place; a meeting with a join link gets a "Join" button until it ends. Opening the page reads
 * the calendars again.
 */
export function CalendarPanel({
  snapshot,
  now,
  onRefresh,
  onOpenSettings,
}: {
  snapshot: CalendarSnapshot;
  now: number;
  onRefresh: () => void;
  onOpenSettings: () => void;
}) {
  const t = useTranslation();
  const text = t.calendar;
  useEffect(() => {
    onRefresh();
  }, [onRefresh]);

  const tomorrow = now + 86_400_000;
  const days = [
    { label: text.today, events: snapshot.events.filter((event) => sameDay(event.startMs, now) || (event.startMs < now && event.endMs > now)) },
    { label: text.tomorrow, events: snapshot.events.filter((event) => sameDay(event.startMs, tomorrow)) },
  ];

  const row = (event: CalendarEvent) => {
    const past = event.endMs <= now;
    const running = event.startMs <= now && now < event.endMs;
    const time = event.allDay ? text.allDay : `${clockTime(event.startMs)}–${clockTime(event.endMs)}`;
    return (
      <li key={`${event.uid}:${event.startMs}`} className={`calendar-event${past ? " calendar-event--past" : ""}${running && !event.allDay ? " calendar-event--now" : ""}`}>
        <span className="calendar-event__time">{time}</span>
        <span className="calendar-event__main">
          <span className="calendar-event__title">{event.title || text.untitled}</span>
          <span className="calendar-event__place">{[event.location, event.calendar].filter(Boolean).join(" · ")}</span>
        </span>
        {event.meetingLink && !past && (
          <button className="calendar-event__join" type="button" aria-label={text.joinLabel(event.title || text.untitled)} onClick={() => join(event.meetingLink!)}>
            <Video size={13} strokeWidth={2.4} aria-hidden="true" />
            {text.join}
          </button>
        )}
      </li>
    );
  };

  return (
    <section className="calendar-panel" aria-label={text.title}>
      <div className="calendar-panel__head">
        <span className="calendar-panel__status">
          {snapshot.problems.length > 0 ? text.problems(snapshot.problems.length) : snapshot.fetchedAt ? text.updatedAt(clockTime(snapshot.fetchedAt)) : ""}
        </span>
        <button className="calendar-panel__icon" type="button" aria-label={text.refresh} onClick={onRefresh}>
          <RefreshCcw size={14} strokeWidth={2.2} aria-hidden="true" />
        </button>
        <button className="calendar-panel__icon" type="button" aria-label={text.openSettings} onClick={onOpenSettings}>
          <Settings size={14} strokeWidth={2.2} aria-hidden="true" />
        </button>
      </div>
      <div className="calendar-panel__days">
        {days.map((day) => (
          <div key={day.label} className="calendar-day">
            <h3 className="calendar-day__label">{day.label}</h3>
            {day.events.length > 0 ? <ul className="calendar-day__events">{day.events.map(row)}</ul> : <p className="calendar-day__empty">{text.nothing}</p>}
          </div>
        ))}
      </div>
    </section>
  );
}
