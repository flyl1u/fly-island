import { useState, type MouseEvent } from "react";
import { ExternalLink, Lock, Settings2, Trash2 } from "lucide-react";
import { ToggleControl } from "../../components/controls/ToggleControl";
import { useLocale, useTranslation } from "../../i18n";
import { openPluginHomepage, PLUGIN_PERMISSIONS, type PluginInfo, type PluginPermission } from "./api";
import { isSensitivePermission } from "./promptedPermissions";
import { NodeMissingHint } from "./NodeMissingHint";
import { PluginRunStats } from "./PluginRunStats";
import "./PluginCard.css";

const isPermission = (name: string): name is PluginPermission =>
  (PLUGIN_PERMISSIONS as readonly string[]).includes(name);

/** The permissions folded into a count; opening it lists them, sensitive ones marked, optional ones last. */
function PermissionSummary({ permissions, optional }: { permissions: string[]; optional: string[] }) {
  const t = useTranslation();
  if (permissions.length + optional.length === 0) {
    return <span className="plugin-card__permissions-none">{t.settings.plugins.noPermissions}</span>;
  }
  const hasSensitive = permissions.some(isSensitivePermission);
  const item = (permission: string, isOptional: boolean) => (
    <li key={permission} className={isSensitivePermission(permission) ? "plugin-card__permission--sensitive" : undefined}>
      {isPermission(permission) ? t.settings.plugins.permission[permission] : permission}
      {isOptional ? ` (${t.settings.plugins.optionalPermission})` : ""}
    </li>
  );

  return (
    <details className={`plugin-card__permissions${hasSensitive ? " plugin-card__permissions--sensitive" : ""}`}>
      <summary>
        <Lock size={11} strokeWidth={2.4} />
        <span>{t.settings.plugins.permissionCount(permissions.length + optional.length)}</span>
      </summary>
      <ul>
        {permissions.map((permission) => item(permission, false))}
        {optional.map((permission) => item(permission, true))}
      </ul>
    </details>
  );
}

/** Clicks on these inside a card do their own thing rather than open the plugin's page. */
const OWN_CLICK = "button, a, input, label, summary, details";

/**
 * One installed plugin: name, status and switch on one row, a two-line description, notes, then
 * permissions and actions. Clicking anywhere else on the card opens the plugin's own page.
 */
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
  // Built-in and development plugins run without "allow third-party plugins".
  const canRun = allowed || plugin.builtin || plugin.dev;
  const showStatus = plugin.hasProcess && canRun && isOn;
  const description = plugin.description?.[locale];
  const invalid = Boolean(plugin.invalidReason);
  const canUninstall = !plugin.builtin && !plugin.dev;
  const openFromCard = (event: MouseEvent<HTMLElement>) => {
    if (invalid || (event.target as Element).closest(OWN_CLICK)) return;
    onOpenDetail();
  };

  return (
    <article className={invalid ? "plugin-card" : "plugin-card plugin-card--openable"} onClick={openFromCard}>
      <header className="plugin-card__header">
        <div className="plugin-card__title">
          <div className="plugin-card__name">
            <strong>{name}</strong>
            {showStatus ? (
              <span className={`plugin-card__status plugin-card__status--${plugin.status}`}>
                {t.settings.plugins.status[plugin.status]}
              </span>
            ) : null}
          </div>
          <span>
            {[
              plugin.builtin && t.settings.plugins.builtin,
              plugin.dev && t.settings.plugins.dev.badge,
              plugin.version && `v${plugin.version}`,
              plugin.authorKey && t.settings.plugins.market.signed,
              plugin.author && t.settings.plugins.by(plugin.author),
            ]
              .filter(Boolean)
              .join(" · ")}
          </span>
        </div>
        {plugin.dev || invalid ? null : (
          <div className="plugin-card__switch">
            <ToggleControl label={t.settings.plugins.enable} checked={isOn} onChange={(enabled) => !busy && onEnabledChange(enabled)} />
          </div>
        )}
      </header>

      {invalid ? (
        <p className="plugin-card__error">
          {t.settings.plugins.invalid}: {plugin.invalidReason}
        </p>
      ) : (
        <>
          {description ? (
            <p className="plugin-card__description">
              {description}
            </p>
          ) : null}
          <div className="plugin-card__notes">
            {plugin.revoked ? (
              <p className="plugin-card__error">{t.settings.plugins.updates.revoked(plugin.revoked[locale])}</p>
            ) : null}
            {plugin.autoUpdated ? <p className="plugin-card__hint">{t.settings.plugins.updates.autoUpdated(plugin.autoUpdated)}</p> : null}
            {plugin.updateAvailable && plugin.updateAvailable !== plugin.autoUpdated ? (
              <p className={plugin.signingKeyChanged ? "plugin-card__hint plugin-card__hint--warn" : "plugin-card__hint"}>
                {plugin.signingKeyChanged ? t.settings.plugins.updates.keyChanged(plugin.updateAvailable) : t.settings.plugins.updates.available(plugin.updateAvailable)}
              </p>
            ) : null}
            {plugin.preReleaseAvailable && !plugin.preRelease ? (
              <p className="plugin-card__hint">{t.settings.plugins.updates.preReleaseOffered(plugin.preReleaseAvailable)}</p>
            ) : null}
            {plugin.needsApproval ? <p className="plugin-card__hint plugin-card__hint--warn">{t.settings.plugins.needsApproval}</p> : null}
            {isOn && !canRun ? <p className="plugin-card__hint plugin-card__hint--warn">{t.settings.plugins.notAllowed}</p> : null}
            {!plugin.hasProcess ? <p className="plugin-card__hint">{t.settings.plugins.describedOnly}</p> : null}
            {plugin.runtime === "node" && !nodeAvailable ? <NodeMissingHint /> : null}
            {showStatus && plugin.error ? <p className="plugin-card__error">{plugin.error}</p> : null}
            {showStatus ? <PluginRunStats plugin={plugin} /> : null}
            {plugin.keybindingConflicts.length > 0 ? (
              <p className="plugin-card__hint plugin-card__hint--warn">
                {t.settings.plugins.keybindingConflict(plugin.keybindingConflicts.join(", "))}
              </p>
            ) : null}
          </div>
        </>
      )}

      <footer className="plugin-card__footer">
        {invalid ? <span /> : <PermissionSummary permissions={plugin.permissions} optional={plugin.optionalPermissions ?? []} />}
        <div className="plugin-card__actions">
          {invalid ? null : (
            <button className="plugin-card__button" type="button" onClick={onOpenDetail}>
              <Settings2 size={12} strokeWidth={2.4} />
              <span>{t.settings.plugins.detail.open}</span>
            </button>
          )}
          {!invalid && plugin.homepage.startsWith("https://") ? (
            <button
              className="plugin-card__button plugin-card__button--icon"
              type="button"
              aria-label={t.settings.plugins.homepage}
              onClick={() => void openPluginHomepage(plugin.homepage)}
            >
              <ExternalLink size={12} strokeWidth={2.4} />
            </button>
          ) : null}
          {canUninstall ? (
            <button
              className={`plugin-card__button ${confirmingUninstall ? "plugin-card__button--danger" : "plugin-card__button--quiet plugin-card__button--icon"}`}
              type="button"
              aria-label={confirmingUninstall ? undefined : t.settings.plugins.uninstall}
              disabled={busy}
              onBlur={() => setConfirmingUninstall(false)}
              onClick={() => (confirmingUninstall ? onUninstall() : setConfirmingUninstall(true))}
            >
              <Trash2 size={12} strokeWidth={2.4} />
              {/* An icon until pressed; the second press needs the words. */}
              {confirmingUninstall ? <span>{t.settings.plugins.confirmUninstall}</span> : null}
            </button>
          ) : null}
        </div>
      </footer>
    </article>
  );
}
