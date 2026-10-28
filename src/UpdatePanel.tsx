import { useSyncExternalStore } from "react";
import { Loader2, RefreshCcw } from "lucide-react";
import { useTranslation } from "./i18n";
import { checkForUpdate, getUpdateState, installUpdate, subscribeToUpdate } from "./updaterController";
import "./UpdatePanel.css";

export function UpdatePanel() {
  const t = useTranslation();
  const { stage, version, nextVersion, downloaded, total, detail } = useSyncExternalStore(
    subscribeToUpdate,
    getUpdateState,
  );

  const percent = total > 0 ? Math.min(100, Math.round((downloaded / total) * 100)) : null;
  const busy = stage === "checking" || stage === "downloading" || stage === "installing";

  let status = version ? t.settings.project.update.versionLabel(version) : t.settings.project.update.hint;
  let action = t.settings.project.update.check;
  let onAction = checkForUpdate;

  if (stage === "disabled") {
    status = t.settings.project.update.unavailable;
  } else if (stage === "checking") {
    status = t.settings.project.update.checking;
  } else if (stage === "latest") {
    status = t.settings.project.update.upToDate(version);
  } else if (stage === "available") {
    status = t.settings.project.update.available(nextVersion);
    action = t.settings.project.update.download;
    onAction = installUpdate;
  } else if (stage === "downloading") {
    status = percent === null
      ? t.settings.project.update.downloadingUnknown
      : t.settings.project.update.downloading(percent);
    action = t.settings.project.update.download;
    onAction = installUpdate;
  } else if (stage === "installing") {
    status = t.settings.project.update.installing;
  } else if (stage === "done") {
    status = t.settings.project.update.done;
  } else if (stage === "error") {
    status = t.settings.project.update.error;
  }

  const showAction = stage !== "done" && stage !== "disabled";

  return (
    <div className={`update-panel update-panel--${stage}`}>
      <div className="update-panel__row">
        <span className="update-panel__icon" aria-hidden="true">
          {busy ? (
            <Loader2 size={18} strokeWidth={1.8} />
          ) : (
            <RefreshCcw size={18} strokeWidth={1.8} />
          )}
        </span>
        <span className="update-panel__copy">
          <strong>{t.settings.project.update.title}</strong>
          <span role={stage === "error" ? "alert" : undefined}>{status}</span>
          {stage === "error" && detail && (
            <span className="update-panel__detail">{t.settings.project.update.errorDetail(detail)}</span>
          )}
        </span>
        {showAction && (
          <button
            className="update-panel__action"
            type="button"
            disabled={busy}
            onClick={() => void onAction()}
          >
            {action}
          </button>
        )}
      </div>
      {percent !== null && (stage === "downloading" || stage === "installing") && (
        <div
          className="update-panel__track"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={percent}
        >
          <span className="update-panel__fill" style={{ width: `${percent}%` }} />
        </div>
      )}
    </div>
  );
}
