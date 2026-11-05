import { useEffect, useMemo, useSyncExternalStore } from "react";
import { ArrowRight, Download, RefreshCcw } from "lucide-react";
import { useLocale, useTranslation } from "../../i18n";
import { ProjectLink } from "./ProjectLink";
import { PROJECT_RELEASES_URL } from "./projectLinks";
import { releaseNoteLines } from "./releaseNotes";
import { UpdateChannelRow } from "./UpdateChannelRow";
import {
  checkForUpdate,
  checkOnFirstVisit,
  getUpdateState,
  installUpdate,
  skipVersion,
  subscribeToUpdate,
} from "./updaterController";
// The project-link card styles live with the About section; the Updates page needs them too.
import "./ProjectSettingsSection.css";
import "./UpdatePanel.css";

export function UpdatePanel() {
  const t = useTranslation();
  const { locale } = useLocale();
  const { stage, version, channel, nextVersion, notes, downloaded, total, detail, skippedVersion } = useSyncExternalStore(
    subscribeToUpdate,
    getUpdateState,
  );
  const noteLines = useMemo(() => releaseNoteLines(notes, locale), [notes, locale]);

  useEffect(() => {
    void checkOnFirstVisit();
  }, []);

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
      {stage === "available" && (
        <div className="update-panel__skip">
          <span>
            {skippedVersion === nextVersion
              ? t.settings.project.update.skipped(nextVersion)
              : t.settings.project.update.skipHint}
          </span>
          <button
            className="update-panel__skip-button"
            type="button"
            onClick={() => skipVersion(skippedVersion === nextVersion ? null : nextVersion)}
          >
            {skippedVersion === nextVersion ? t.settings.project.update.unskip : t.settings.project.update.skip}
          </button>
        </div>
      )}
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
      {noteLines.length > 0 && (stage === "available" || stage === "downloading") && (
        <div className="update-panel__notes" aria-label={t.settings.project.update.notesTitle(nextVersion)}>
          <p className="update-panel__notes-title">{t.settings.project.update.notesTitle(nextVersion)}</p>
          {noteLines.map((line, index) =>
            line.kind === "heading" ? (
              <p key={index} className="update-panel__notes-heading">{line.text}</p>
            ) : (
              <p key={index} className={`update-panel__notes-${line.kind}`}>{line.text}</p>
            ),
          )}
        </div>
      )}
    </div>
  );
}
