import { useState } from "react";
import { FolderOpen, RefreshCcw } from "lucide-react";
import { ToggleControl } from "../../components/controls/ToggleControl";
import { useTranslation } from "../../i18n";
import { PluginCard } from "./PluginCard";
import { PluginDetailPage } from "./PluginDetailPage";
import { usePlugins } from "./usePlugins";
import "./PluginsSettingsSection.css";

/**
 * The plugins page: the third-party switch, the plugins folder and each installed
 * plugin; or one plugin's own page once its Settings is opened. The market is its own page.
 */
export function PluginsSettingsSection() {
  const t = useTranslation();
  const { snapshot, error, busy, setAllowed, setEnabled, setSetting, setNotificationsMuted, reload, openFolder, runCommand, uninstall } =
    usePlugins();
  const [openId, setOpenId] = useState<string | null>(null);
  const allowed = snapshot?.allowThirdParty ?? false;
  const openPlugin = snapshot?.plugins.find((plugin) => plugin.id === openId);

  if (openPlugin) {
    return (
      <>
        <PluginDetailPage
          plugin={openPlugin}
          busy={busy}
          onBack={() => setOpenId(null)}
          onSettingChange={(key, value) => setSetting(openPlugin.id, key, value)}
          onRunCommand={(command) => runCommand(openPlugin.id, command)}
          onNotificationsMutedChange={(muted) => setNotificationsMuted(openPlugin.id, muted)}
        />
        {error ? <p className="plugin-card__error">{error}</p> : null}
      </>
    );
  }

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
            onOpenDetail={() => setOpenId(plugin.id)}
            onUninstall={() => uninstall(plugin.id)}
          />
        ))}
      </section>
    </>
  );
}
