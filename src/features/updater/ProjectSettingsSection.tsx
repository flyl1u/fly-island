import { useState, type MouseEvent as ReactMouseEvent } from "react";
import { ExternalLink, Star } from "lucide-react";
import { isTauri } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";
import { useTranslation } from "../../i18n";
import { UpdatePanel } from "./UpdatePanel";
import "./ProjectSettingsSection.css";

export function ProjectSettingsSection() {
  const t = useTranslation();
  const [projectLinkFailed, setProjectLinkFailed] = useState(false);

  const openProjectLink = async (event: ReactMouseEvent<HTMLAnchorElement>) => {
    if (!isTauri()) {
      return;
    }

    event.preventDefault();
    const url = event.currentTarget.href;
    setProjectLinkFailed(false);

    try {
      await openUrl(url);
    } catch (error) {
      console.error("Failed to open project link", error);
      setProjectLinkFailed(true);
    }
  };

  return (
    <section className="settings-section settings-section--project">
      <div className="settings-section__header">
        <span>{t.settings.project.title}</span>
      </div>
      <UpdatePanel />
      <a
        className="project-link project-link--star"
        href="https://github.com/flyl1u/fly-island"
        target="_blank"
        rel="noopener noreferrer"
        onClick={openProjectLink}
      >
        <Star className="project-link__icon" size={19} strokeWidth={1.8} aria-hidden="true" />
        <span className="project-link__copy">
          <strong>{t.settings.project.star}</strong>
          <span>{t.settings.project.starHint}</span>
        </span>
        <ExternalLink className="project-link__arrow" size={14} aria-hidden="true" />
      </a>
      {projectLinkFailed && (
        <p className="project-link-error" role="alert">{t.settings.project.openFailed}</p>
      )}
    </section>
  );
}
