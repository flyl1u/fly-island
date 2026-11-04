import { useState, type MouseEvent as ReactMouseEvent, type ReactNode } from "react";
import { ExternalLink } from "lucide-react";
import { isTauri } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";
import { useTranslation } from "../../i18n";

/** A settings card that opens a project page. In the app, the system browser opens it. */
export function ProjectLink({
  href,
  title,
  hint,
  icon,
  tone,
}: {
  href: string;
  title: string;
  hint: string;
  icon: ReactNode;
  tone?: "star" | "release";
}) {
  const t = useTranslation();
  const [failed, setFailed] = useState(false);

  const open = async (event: ReactMouseEvent<HTMLAnchorElement>) => {
    if (!isTauri()) return;

    event.preventDefault();
    setFailed(false);
    try {
      await openUrl(event.currentTarget.href);
    } catch (error) {
      console.error("Failed to open project link", error);
      setFailed(true);
    }
  };

  return (
    <>
      <a
        className={tone ? `project-link project-link--${tone}` : "project-link"}
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        onClick={(event) => void open(event)}
      >
        {icon}
        <span className="project-link__copy">
          <strong>{title}</strong>
          <span>{hint}</span>
        </span>
        <ExternalLink className="project-link__arrow" size={14} aria-hidden="true" />
      </a>
      {failed && (
        <p className="project-link-error" role="alert">{t.settings.project.openFailed}</p>
      )}
    </>
  );
}
