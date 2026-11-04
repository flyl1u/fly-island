import { useState } from "react";
import { ExternalLink, Settings2, Trash2 } from "lucide-react";
import { ToggleControl } from "../../components/controls/ToggleControl";
import { useLocale, useTranslation } from "../../i18n";
import { openPluginHomepage, PLUGIN_PERMISSIONS, type PluginInfo, type PluginPermission } from "./api";
import { NodeMissingHint } from "./NodeMissingHint";
import "./PluginCard.css";

const isPermission = (name: string): name is PluginPermission =>
  (PLUGIN_PERMISSIONS as readonly string[]).includes(name);

/** One installed plugin: description, permissions, switch and status; the rest is on its own page. */
export function PluginCard({
  plugin,
  allowed,
  nodeAvailable,
  busy,
  onEnabledChange,
  onOpenDetail,
  onUninstall,
}: {
  plugin: PluginInfo;
  allowed: boolean;
  nodeAvailable: boolean;
  busy: boolean;
  onEnabledChange: (enabled: boolean) => void;
  /** Opens the plugin's own page (info, settings, actions, log). */
  onOpenDetail: () => void;
  onUninstall: () => void;
}) {
  // Uninstalling takes a second click, so a stray click cannot delete a plugin.
  const [confirmingUninstall, setConfirmingUninstall] = useState(false);
  const t = useTranslation();
  const { locale } = useLocale();
  const name = plugin.name?.[locale] ?? plugin.id;
  const isOn = plugin.enabled && !plugin.needsApproval;
  const showStatus = plugin.hasProcess && allowed && isOn;

  return (
    <article className="plugin-card">
      <header className="plugin-card__header">
        <div className="plugin-card__title">
          <strong title={plugin.id}>{name}</strong>
          <span>
            {[plugin.version && `v${plugin.version}`, plugin.author && t.settings.plugins.by(plugin.author)]
              .filter(Boolean)
              .join(" · ")}
          </span>
        </div>
        {showStatus ? (
          <span className={`plugin-card__status plugin-card__status--${plugin.status}`}>
            {t.settings.plugins.status[plugin.status]}
          </span>
        ) : null}
      </header>

      {plugin.invalidReason ? (
        <p className="plugin-card__error">
          {t.settings.plugins.invalid}: {plugin.invalidReason}
        </p>
      ) : null}
      {plugin.invalidReason ? null : (
        <>
          {plugin.description?.[locale] ? <p className="plugin-card__description">{plugin.description[locale]}</p> : null}
          <div className="plugin-card__permissions">
            <span>{t.settings.plugins.permissions}</span>
            {plugin.permissions.length === 0 ? (
              <em>{t.settings.plugins.noPermissions}</em>
            ) : (
              <ul>
                {plugin.permissions.map((permission) => (
                  <li key={permission}>
                    {isPermission(permission) ? t.settings.plugins.permission[permission] : permission}
                  </li>
                ))}
              </ul>
            )}
          </div>
          <ToggleControl label={t.settings.plugins.enable} checked={isOn} onChange={(enabled) => !busy && onEnabledChange(enabled)} />
          {plugin.needsApproval ? <p className="plugin-card__hint">{t.settings.plugins.needsApproval}</p> : null}
          {isOn && !allowed ? <p className="plugin-card__hint">{t.settings.plugins.notAllowed}</p> : null}
          {!plugin.hasProcess ? <p className="plugin-card__hint">{t.settings.plugins.describedOnly}</p> : null}
          {plugin.runtime === "node" && !nodeAvailable ? <NodeMissingHint /> : null}
          {showStatus && plugin.error ? <p className="plugin-card__error">{plugin.error}</p> : null}
          <div className="plugin-card__actions">
            <button className="plugin-card__button" type="button" onClick={onOpenDetail}>
              <Settings2 size={12} strokeWidth={2.4} />
              <span>{t.settings.plugins.detail.open}</span>
            </button>
            {plugin.homepage.startsWith("https://") ? (
              <button className="plugin-card__button" type="button" onClick={() => void openPluginHomepage(plugin.homepage)}>
                <ExternalLink size={12} strokeWidth={2.4} />
                <span>{t.settings.plugins.homepage}</span>
              </button>
            ) : null}
          </div>
        </>
      )}
      <div className="plugin-card__actions">
        <button
          className={`plugin-card__button${confirmingUninstall ? " plugin-card__button--danger" : ""}`}
          type="button"
          disabled={busy}
          onBlur={() => setConfirmingUninstall(false)}
          onClick={() => (confirmingUninstall ? onUninstall() : setConfirmingUninstall(true))}
        >
          <Trash2 size={12} strokeWidth={2.4} />
          <span>{confirmingUninstall ? t.settings.plugins.confirmUninstall : t.settings.plugins.uninstall}</span>
        </button>
      </div>
    </article>
  );
}
