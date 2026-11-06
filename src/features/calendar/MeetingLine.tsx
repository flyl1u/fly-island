import { CalendarClock } from "lucide-react";
import { useTranslation } from "../../i18n";
import type { UpcomingMeeting } from "./upcoming";
import "./MeetingLine.css";

/**
 * The collapsed island's line for a meeting about to start: "周会 · 10 分钟后", or "进行中"
 * once it started. Phrasing content only: it sits inside the bar's open button.
 */
export function MeetingLine({ meeting, showTitle }: { meeting: UpcomingMeeting; showTitle: boolean }) {
  const text = useTranslation().calendar;
  const when = meeting.minutes > 0 ? text.inMinutes(meeting.minutes) : text.started;
  const title = showTitle && meeting.event.title ? meeting.event.title : text.meeting;
  return (
    <span className={`island-meeting${meeting.minutes === 0 ? " island-meeting--started" : ""}`}>
      <CalendarClock className="island-meeting__icon" size={15} strokeWidth={2.2} aria-hidden="true" />
      <span className="island-meeting__title">{title}</span>
      <span className="island-meeting__when">· {when}</span>
    </span>
  );
}
