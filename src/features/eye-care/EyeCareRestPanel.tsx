import { useTranslation } from "../../i18n";
import { SettingsLinkButton } from "../../components/settings/SettingsLinkButton";
import { POSTPONEMENT_MINUTES } from "./countdown";
import { useCountdown } from "../../lib/useCountdown";
import { formatCountdown } from "../../utils/countdown";
import type { EyeCareBreak } from "./types";
import "./EyeCareRestPanel.css";

/**
 * The break screen on each display. It follows the island's own page: one card, the remaining
 * time as the loudest element with its label underneath, a thin bar for what is left, and the
 * postponement choices as quiet pills. Nothing else is added — no plugin badge, no looking-away
 * hint — so the screen holds only what the user can read or act on.
 */
export function EyeCareRestPanel({ snapshot, busy, failed, onAction }: {
  snapshot: EyeCareBreak | null;
  busy: boolean;
  failed: boolean;
  onAction: (action: string) => void;
}) {
  const text = useTranslation(snapshot?.language).eyeCare;
  const seconds = useCountdown(snapshot?.deadline ?? null);
  if (!snapshot) return null;
  const disabled = busy || seconds === 0;
  const percent = snapshot.percent === null ? null : Math.min(100, Math.max(0, snapshot.percent));
  return (
    <section className="eye-care-rest" lang={snapshot.language} aria-labelledby="eye-care-title">
      <div className="eye-care-rest__card">
        <h1 className="eye-care-rest__title" id="eye-care-title">{text.title}</h1>
        <div className="eye-care-rest__timer">
          <div className="eye-care-rest__clock" role="timer" aria-label={text.remaining}>
            {formatCountdown(seconds, true)}
          </div>
          <p className="eye-care-rest__label">{text.remaining}</p>
          {percent !== null && <div className="eye-care-rest__meter" aria-hidden="true">
            <span style={{ width: `${percent}%` }} />
          </div>}
        </div>
        <div className="eye-care-rest__body">
          {snapshot.canSnooze ? (
            <div className="eye-care-rest__postpone">
              <p className="eye-care-rest__caption">{text.postponeOnce}</p>
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
          {snapshot.canSkip && <div className="eye-care-rest__actions">
            <SettingsLinkButton tone="danger" disabled={disabled} onClick={() => onAction("skip")}>{text.skip}</SettingsLinkButton>
          </div>}
          {failed && <p className="eye-care-rest__error" role="alert">{text.failed}</p>}
        </div>
      </div>
    </section>
  );
}
