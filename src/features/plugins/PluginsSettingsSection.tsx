import { FolderOpen, RefreshCcw } from "lucide-react";
import { ToggleControl } from "../../components/controls/ToggleControl";
import { useTranslation } from "../../i18n";
import { PluginCard } from "./PluginCard";
import { PluginMarketSection } from "./PluginMarketSection";
import { usePlugins } from "./usePlugins";
import "./PluginsSettingsSection.css";

/** The plugins page: the third-party switch, the plugins folder and each installed plugin. */
export function PluginsSettingsSection() {
  const t = useTranslation();
  const { snapshot, error, busy, setAllowed, setEnabled, reload, openFolder, runCommand, uninstall, applySnapshot } = usePlugins();
  const allowed = snapshot?.allowThirdParty ?? false;

  return (
    <>
      <section className="settings-section plugins-panel">
        <div className="settings-section__header">
          <span>{t.settings.plugins.title}</span>
        </div>
        <ToggleControl label={t.settings.plugins.allowThirdParty} checked={allowed} onChange={(next) => !busy && setAllowed(next)} />
        <p className="settings-section__hint">{t.settings.plugins.warning}</p>
        <div className="plugins-folder">
          <span>{t.settings.plugins.folder}</span>
          <code title={snapshot?.pluginsDir}>{snapshot?.pluginsDir ?? ""}</code>
          <button className="plugin-card__button" type="button" onClick={openFolder}>
            <FolderOpen size={12} strokeWidth={2.4} />
            <span>{t.settings.plugins.openFolder}</span>
          </button>
          <button className="plugin-card__button" type="button" disabled={busy} onClick={reload}>
            <RefreshCcw size={12} strokeWidth={2.4} />
            <span>{t.settings.plugins.reload}</span>
          </button>
        </div>
        {error ? <p className="plugin-card__error">{error}</p> : null}
      </section>
      <section className="settings-section plugins-panel">
        {snapshot && snapshot.plugins.length === 0 ? (
          <p className="settings-section__hint">{t.settings.plugins.empty}</p>
        ) : null}
        {snapshot?.plugins.map((plugin) => (
          <PluginCard
            key={plugin.id}
            plugin={plugin}
            allowed={allowed}
            nodeAvailable={snapshot.nodeAvailable}
            busy={busy}
            onEnabledChange={(enabled) => setEnabled(plugin.id, enabled)}
            onRunCommand={(command) => runCommand(plugin.id, command)}
            onUninstall={() => uninstall(plugin.id)}
          />
        ))}
      </section>
      <PluginMarketSection onInstalled={applySnapshot} />
    </>
  );
}
