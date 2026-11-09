import { useSyncExternalStore } from "react";
import { CircleHelp, Star, Tag } from "lucide-react";
import { SettingsGroup } from "../../components/settings/SettingsGroup";
import { useTranslation } from "../../i18n";
import markUrl from "../../../src-tauri/icons/mark.svg";
import { ProjectLink } from "./ProjectLink";
import { PROJECT_ISSUES_URL, PROJECT_RELEASES_URL, PROJECT_REPO_URL } from "./projectLinks";
import { getUpdateState, subscribeToUpdate } from "./updaterController";
import "./ProjectSettingsSection.css";
import "./UpdatePanel.css";

/** Settings → About, first: the island's mark, name, version and what it does. */
export function ProjectIdentitySection() {
  const t = useTranslation();
  const { version } = useSyncExternalStore(subscribeToUpdate, getUpdateState);

  return (
    <SettingsGroup>
      <div className="about-identity">
        <img className="about-identity__mark" src={markUrl} alt="" width={48} height={48} />
        <div className="about-identity__body">
          <div className="about-identity__heading">
            <p className="about-identity__name">{t.settings.project.appName}</p>
            {version && <span className="about-identity__version">{t.settings.project.versionChip(version)}</span>}
          </div>
          <p className="about-identity__description">{t.settings.project.description}</p>
        </div>
      </div>
    </SettingsGroup>
  );
}

/** Settings → About → Links: releases, reporting a problem, and starring the project. */
export function ProjectLinksSection() {
  const t = useTranslation();

  return (
    <SettingsGroup title={t.settings.project.linksTitle}>
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
    </SettingsGroup>
  );
}
