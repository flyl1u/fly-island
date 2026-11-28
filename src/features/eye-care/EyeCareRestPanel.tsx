import { useTranslation } from "../../i18n";
import { SettingsLinkButton } from "../../components/settings/SettingsLinkButton";
import { POSTPONEMENT_MINUTES } from "./countdown";
import { useElapsed } from "../../lib/useElapsed";
import { formatCountdown } from "../../utils/countdown";
import type { EyeCareBreak } from "./types";
import "./EyeCareRestPanel.css";

/**
 * The break screen on each display. It follows the island's own page: one card, the rest time
 * counting up as the loudest element with its label underneath, a thin bar filling as it runs,
 * and the postponement choices as quiet pills. Once the break runs its full length the buttons
 * give way to a line that explains how the idle screens end. Nothing else is added — no plugin
 * badge, no looking-away hint — so the screen holds only what the user can read or act on.
 */
export function EyeCareRestPanel({ snapshot, busy, failed, onAction }: {
  snapshot: EyeCareBreak | null;
  busy: boolean;
  failed: boolean;
  onAction: (action: string) => void;
}) {
  const text = useTranslation(snapshot?.language).eyeCare;
  const seconds = useElapsed(snapshot?.startedAt ?? null);
  if (!snapshot) return null;
  // The bar and the digits come from the same whole seconds, so the bar fills exactly when the
  // total reaches the break's length and never trails or stops short of it.
  const total = snapshot.totalMs ?? 0;
  const percent = total > 0
    ? Math.round(Math.min(100, Math.max(0, ((seconds * 1000) / total) * 100)) * 100) / 100
    : snapshot.percent === null ? null : Math.min(100, Math.max(0, snapshot.percent));
  return (
    <section className="eye-care-rest" lang={snapshot.language} aria-labelledby="eye-care-title">
      <div className="eye-care-rest__card">
        <h1 className="eye-care-rest__title" id="eye-care-title">{snapshot.done ? text.done : text.resting}</h1>
        <div className="eye-care-rest__timer">
          <div className="eye-care-rest__clock" role="timer" aria-label={text.elapsed}>
            {formatCountdown(seconds, true)}
          </div>
          <p className="eye-care-rest__label">{text.elapsed}</p>
          {percent !== null && <div className="eye-care-rest__meter" aria-hidden="true">
            <span style={{ width: `${percent}%` }} />
          </div>}
        </div>
        <div className="eye-care-rest__body">
          {snapshot.done ? (
            <p className="eye-care-rest__hint">{text.doneHint}</p>
          ) : (
            <>
              {snapshot.canSnooze ? (
                <div className="eye-care-rest__postpone">
                  <p className="eye-care-rest__caption">{text.postponeOnce}</p>
                  <div className="eye-care-rest__choices" role="group" aria-label={text.postpone}>
                    {POSTPONEMENT_MINUTES.map((minutes) => (
                      <SettingsLinkButton key={minutes} disabled={busy}
                        ariaLabel={text.postponeBy(minutes)} onClick={() => onAction(`snooze_${minutes}`)}>
                        {text.minutes(minutes)}
                      </SettingsLinkButton>
                    ))}
                  </div>
                </div>
              ) : <p className="eye-care-rest__note">{text.alreadyPostponed}</p>}
              {snapshot.canSkip && <div className="eye-care-rest__actions">
                <SettingsLinkButton tone="danger" disabled={busy} onClick={() => onAction("skip")}>{text.skip}</SettingsLinkButton>
              </div>}
            </>
          )}
          {failed && <p className="eye-care-rest__error" role="alert">{text.failed}</p>}
        </div>
      </div>
    </section>
  );
}
