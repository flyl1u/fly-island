import { BellRing } from "lucide-react";
import "./WaterReminderNotice.css";

export function WaterReminderNotice({ text }: { text: string }) {
  return <span className="water-reminder-notice" role="status">
    <BellRing className="water-reminder-notice__bell" size={16} aria-hidden="true" />
    <span className="water-reminder-notice__text">{text}</span>
  </span>;
}
