import type { CSSProperties, ReactNode } from "react";
import { Check, Settings2 } from "lucide-react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { SettingsLinkButton } from "../../components/settings/SettingsLinkButton";
import { SettingsSwitch } from "../../components/settings/SettingsSwitch";
import type { PluginInstallProgress } from "../../features/plugins/api";
import type { PluginAuthor } from "../../features/plugins/native/catalog";
import { PluginCardProgress } from "./PluginCardProgress";
import { useTranslation } from "../../i18n";

/** One square market card: icon, name and author, a short pitch, and the installation controls. */
export function PluginMarketCard({
  name, description, accent, author, icon, installed, enabled, inDevelopment, job, switching, reason, onRetry, onToggle, onChangeInstallation, onOpenSettings, update,
}: {
  name: string;
  description: string;
  accent: string;
  author: PluginAuthor;
  icon: ReactNode;
  installed: boolean;
  enabled: boolean;
  inDevelopment: boolean;
  /** The install or removal running right now, if any. */
  job?: PluginInstallProgress;
  switching: boolean;
  reason: string | null;
  /** Offered after a failed install or removal. */
  onRetry?: () => void;
  onToggle: (checked: boolean) => void;
  onChangeInstallation: () => void;
  /** Present once the plugin is on and has settings somewhere. */
  onOpenSettings?: () => void;
  /** A newer published version, found by checking for updates. */
  update?: { version: string; onUpdate: () => void };
}) {
  const { market: t, update: updateLabel } = useTranslation().settings.plugins;
  const removing = job?.phase === "uninstalling";
  const stateClass = installed ? ` plugin-card--installed${enabled ? "" : " plugin-card--disabled"}` : "";
  return <li className={`plugin-card${stateClass}${reason || (update && !job) ? " plugin-card--with-error" : ""}`} style={{ "--plugin-accent": accent } as CSSProperties}>
    <div className="plugin-card__top">
      <span className="plugin-card__icon">
        {icon}
        {installed && <span className="plugin-card__check" aria-hidden="true"><Check size={10} strokeWidth={3} /></span>}
      </span>
      <div className="plugin-card__heading">
        <h3 className="plugin-card__name">{name}</h3>
        <p className="plugin-card__author">
          {t.by}{" "}
          <a className="plugin-card__author-link" href={author.url}
            onClick={(event) => { event.preventDefault(); void openUrl(author.url).catch(console.error); }}>@{author.name}</a>
        </p>
      </div>
    </div>
    {job ? <PluginCardProgress name={name} job={job} /> : <p className="plugin-card__description">{description}</p>}
    {reason && !job && <p className="plugins-settings__error plugin-card__error" role="alert">
      {reason}
      {onRetry && <span className="plugin-card__retry"><SettingsLinkButton onClick={onRetry}>{t.retry}</SettingsLinkButton></span>}
    </p>}
    {update && !job && <p className="plugin-card__update">
      <span>{t.updateAvailable(update.version)}</span>
      <SettingsLinkButton ariaLabel={t.updateNamed(name)} disabled={switching} onClick={update.onUpdate}>{updateLabel}</SettingsLinkButton>
    </p>}
    <div className="plugin-card__footer">
      {installed && <span className="plugin-card__controls">
        <SettingsSwitch
          size="small"
          ariaLabel={t.enableNamed(name)}
          checked={enabled}
          disabled={switching || job !== undefined}
          onChange={onToggle}
        />
        {onOpenSettings && !job && <button type="button" className="plugin-card__settings"
          aria-label={t.openSettingsNamed(name)} onClick={onOpenSettings}>
          <Settings2 size={14} strokeWidth={1.75} aria-hidden="true" />
        </button>}
      </span>}
      {inDevelopment ? <button type="button" className="plugin-card__action plugin-card__action--preview" disabled>
        {t.inDevelopment}
      </button> : job ? <button type="button" className="plugin-card__action" disabled aria-busy="true">
        {removing ? t.uninstalling : t.installing}
      </button> : <button
        type="button"
        className={`plugin-card__action${installed ? " plugin-card__action--remove" : ""}`}
        aria-label={installed ? t.uninstallNamed(name) : t.installNamed(name)}
        disabled={switching}
        onClick={onChangeInstallation}
      >
        {installed ? <><span className="plugin-card__state">{t.installed}</span><span className="plugin-card__remove">{t.uninstall}</span></> : t.install}
      </button>}
    </div>
  </li>;
}
