import { useSyncExternalStore } from "react";
import { Download, RefreshCcw } from "lucide-react";
import { useTranslation } from "../../i18n";
import { ProjectLink } from "./ProjectLink";
import { PROJECT_RELEASES_URL } from "./projectLinks";
import { checkForUpdate, getUpdateState, installUpdate, subscribeToUpdate } from "./updaterController";
// The project-link row styles live with the About section.
import "./ProjectSettingsSection.css";
import "./UpdatePanel.css";

/**
 * Settings → About, first row: check for the latest version, then download, install and
 * restart in place. Only stable releases are offered (the beta channel choice is gone).
 */
export function UpdatePanel() {
  const t = useTranslation();
  const text = t.settings.project.update;
  const { stage, version, nextVersion, downloaded, total, detail } = useSyncExternalStore(
    subscribeToUpdate,
    getUpdateState,
  );

  const percent = total > 0 ? Math.min(100, Math.round((downloaded / total) * 100)) : null;
  const busy = stage === "checking" || stage === "downloading" || stage === "installing";

  let status = version ? text.versionLabel(version) : text.hint;
  let action = t.settings.project.latestRelease;
  let onAction = checkForUpdate;

  // A build without an updater key cannot check. The row still has to open the
  // release page: the hint tells the user to download from there.
  if (stage === "disabled") {
    return (
      <ProjectLink
        href={PROJECT_RELEASES_URL}
        title={t.settings.project.latestRelease}
        hint={text.unavailable}
        icon={<Download className="project-link__icon" size={18} strokeWidth={1.5} absoluteStrokeWidth aria-hidden="true" />}
      />
    );
  }

  if (stage === "checking") {
    status = text.checking;
  } else if (stage === "latest") {
    status = text.upToDate(version);
  } else if (stage === "available") {
    status = text.available(nextVersion);
    action = text.download;
    onAction = installUpdate;
  } else if (stage === "ready") {
    status = text.ready(nextVersion);
    action = text.restart;
    onAction = installUpdate;
  } else if (stage === "downloading") {
    status = percent === null ? text.downloadingUnknown : text.downloading(percent);
    action = text.download;
    onAction = installUpdate;
  } else if (stage === "installing") {
    status = text.installing;
  } else if (stage === "done") {
    status = text.done;
  } else if (stage === "error") {
    status = text.error;
  }

  return (
    <div className={`update-panel update-panel--${stage}`}>
      <div className="update-panel__row">
        <button
          className="project-link update-panel__button"
          type="button"
          disabled={busy || stage === "done"}
          onClick={() => void onAction()}
        >
          <RefreshCcw className="project-link__icon" size={18} strokeWidth={1.5} absoluteStrokeWidth aria-hidden="true" />
          <span className="project-link__copy">
            <strong>{action}</strong>
            <span role={stage === "error" ? "alert" : undefined}>{status}</span>
            {stage === "error" && detail && (
              <span className="update-panel__detail">{text.errorDetail(detail)}</span>
            )}
          </span>
        </button>
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
