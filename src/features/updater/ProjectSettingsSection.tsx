import { useSyncExternalStore } from "react";
import { ArrowRight, CircleHelp, RefreshCcw, Star, Tag } from "lucide-react";
import { useTranslation } from "../../i18n";
import markUrl from "../../../src-tauri/icons/mark.svg";
import { ProjectLink } from "./ProjectLink";
import { PROJECT_ISSUES_URL, PROJECT_RELEASES_URL, PROJECT_REPO_URL } from "./projectLinks";
import { getUpdateState, subscribeToUpdate } from "./updaterController";
import "./ProjectSettingsSection.css";
import "./UpdatePanel.css";

/** Settings → About: what this build is, and where to get the next one. */
export function ProjectSettingsSection({ onOpenUpdates }: { onOpenUpdates: () => void }) {
  const t = useTranslation();
  const { version, stage, nextVersion } = useSyncExternalStore(subscribeToUpdate, getUpdateState);

  return (
    <>
      <section className="settings-section settings-section--about">
        <div className="about-identity">
          <img className="about-identity__mark" src={markUrl} alt="" width={48} height={48} />
          <div className="about-identity__body">
            <div className="about-identity__heading">
              <p className="about-identity__name">{t.settings.project.appName}</p>
              {version && (
                <span className="about-identity__version">{t.settings.project.versionChip(version)}</span>
              )}
            </div>
            <p className="about-identity__description">{t.settings.project.description}</p>
          </div>
        </div>
      </section>
      <section className="settings-section settings-section--about-version">
        <div className="settings-section__header">
          <span>{t.settings.project.versionTitle}</span>
        </div>
        <button className="project-link project-link--release update-panel__button" type="button" onClick={onOpenUpdates}>
          <RefreshCcw className="project-link__icon" size={18} strokeWidth={1.8} aria-hidden="true" />
          <span className="project-link__copy">
            <strong>{t.settings.project.update.openPage}</strong>
            <span>
              {stage === "available"
                ? t.settings.project.update.available(nextVersion)
                : t.settings.project.update.openPageHint}
            </span>
          </span>
          <ArrowRight className="project-link__arrow" size={14} aria-hidden="true" />
        </button>
      </section>
      <section className="settings-section settings-section--about-links">
        <div className="settings-section__header">
          <span>{t.settings.project.linksTitle}</span>
        </div>
        <ProjectLink
          href={PROJECT_RELEASES_URL}
          tone="release"
          title={t.settings.project.releases}
          hint={t.settings.project.releasesHint}
          icon={<Tag className="project-link__icon" size={18} strokeWidth={1.8} aria-hidden="true" />}
        />
        <ProjectLink
          href={PROJECT_ISSUES_URL}
          title={t.settings.project.issues}
          hint={t.settings.project.issuesHint}
          icon={<CircleHelp className="project-link__icon" size={18} strokeWidth={1.8} aria-hidden="true" />}
        />
        <ProjectLink
          href={PROJECT_REPO_URL}
          tone="star"
          title={t.settings.project.star}
          hint={t.settings.project.starHint}
          icon={<Star className="project-link__icon" size={19} strokeWidth={1.8} aria-hidden="true" />}
        />
      </section>
    </>
  );
}
