import { useSyncExternalStore } from "react";
import { ArrowRight, Download, RefreshCcw } from "lucide-react";
import { useTranslation } from "../../i18n";
import { ProjectLink } from "./ProjectLink";
import { PROJECT_RELEASES_URL } from "./projectLinks";
import { UpdateChannelRow } from "./UpdateChannelRow";
import { checkForUpdate, getUpdateState, installUpdate, subscribeToUpdate } from "./updaterController";
// The project-link card styles live with the About section; the Updates page needs them too.
import "./ProjectSettingsSection.css";
import "./UpdatePanel.css";

export function UpdatePanel() {
  const t = useTranslation();
  const { stage, version, channel, nextVersion, downloaded, total, detail } = useSyncExternalStore(
    subscribeToUpdate,
    getUpdateState,
  );

  const percent = total > 0 ? Math.min(100, Math.round((downloaded / total) * 100)) : null;
  const busy = stage === "checking" || stage === "downloading" || stage === "installing";

  let status = version ? t.settings.project.update.versionLabel(version) : t.settings.project.update.hint;
  let action = t.settings.project.latestRelease;
  let onAction = checkForUpdate;

  // A build without an updater key cannot check. The card still has to open the
  // release page: the hint tells the user to download from there.
  if (stage === "disabled") {
    return (
      <ProjectLink
        href={PROJECT_RELEASES_URL}
        tone="release"
        title={t.settings.project.latestRelease}
        hint={t.settings.project.update.unavailable}
        icon={<Download className="project-link__icon" size={18} strokeWidth={1.8} aria-hidden="true" />}
      />
    );
  }

  if (stage === "checking") {
    status = t.settings.project.update.checking;
  } else if (stage === "latest") {
    status = t.settings.project.update.upToDate(version);
  } else if (stage === "available") {
    status = t.settings.project.update.available(nextVersion);
    action = t.settings.project.update.download;
    onAction = installUpdate;
  } else if (stage === "ready") {
    status = t.settings.project.update.ready(nextVersion);
    action = t.settings.project.update.restart;
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

  return (
    <div className={`update-panel update-panel--${stage}`}>
      <UpdateChannelRow channel={channel} disabled={busy || stage === "done"} />
      <button
        className="project-link project-link--release update-panel__button"
        type="button"
        disabled={busy || stage === "done"}
        onClick={() => void onAction()}
      >
        <RefreshCcw className="project-link__icon" size={18} strokeWidth={1.8} aria-hidden="true" />
        <span className="project-link__copy">
          <strong>{action}</strong>
          <span role={stage === "error" ? "alert" : undefined}>{status}</span>
          {stage === "error" && detail && (
            <span className="update-panel__detail">{t.settings.project.update.errorDetail(detail)}</span>
          )}
        </span>
        <ArrowRight className="project-link__arrow" size={14} aria-hidden="true" />
      </button>
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
