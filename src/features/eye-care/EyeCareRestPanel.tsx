import { useEffect, useState } from "react";
import { Eye } from "lucide-react";
import { useTranslation } from "../../i18n";
import { SettingsLinkButton } from "../../components/settings/SettingsLinkButton";
import { breakCountdown, POSTPONEMENT_MINUTES } from "./countdown";
import type { EyeCareBreak } from "./types";
import "./EyeCareRestPanel.css";

export function EyeCareRestPanel({ snapshot, busy, failed, onAction }: {
  snapshot: EyeCareBreak | null;
  busy: boolean;
  failed: boolean;
  onAction: (action: string) => void;
}) {
  const text = useTranslation(snapshot?.language).eyeCare;
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  if (!snapshot) return null;
  const disabled = busy || now >= snapshot.deadline;
  return (
    <section className="eye-care-rest" lang={snapshot.language} aria-labelledby="eye-care-title">
      <div className="eye-care-rest__name"><Eye size={16} strokeWidth={1.5} absoluteStrokeWidth aria-hidden="true" />{text.name}</div>
      <h1 id="eye-care-title">{text.title}</h1>
      <p className="eye-care-rest__hint">{text.hint}</p>
      <div className="eye-care-rest__clock" role="timer" aria-label={text.remaining}>
        {breakCountdown(snapshot.deadline, now)}
      </div>
      <p className="eye-care-rest__note">{text.automatic}</p>
      {snapshot.canSnooze ? (
        <div className="eye-care-rest__postpone">
          <p>{text.postponeOnce}</p>
          <div className="eye-care-rest__choices" role="group" aria-label={text.postpone}>
            {POSTPONEMENT_MINUTES.map((minutes) => (
              <SettingsLinkButton key={minutes} disabled={disabled}
                ariaLabel={text.postponeBy(minutes)} onClick={() => onAction(`snooze_${minutes}`)}>
                {text.minutes(minutes)}
              </SettingsLinkButton>
            ))}
          </div>
        </div>
      ) : <p className="eye-care-rest__note">{text.alreadyPostponed}</p>}
      {snapshot.canSkip && <div className="eye-care-rest__skip">
        <SettingsLinkButton tone="danger" disabled={disabled} onClick={() => onAction("skip")}>{text.skip}</SettingsLinkButton>
      </div>}
      {failed && <p className="eye-care-rest__error" role="alert">{text.failed}</p>}
    </section>
  );
}
