import { useState } from "react";
import { FolderOpen, RefreshCcw } from "lucide-react";
import { ToggleControl } from "../../components/controls/ToggleControl";
import { useTranslation } from "../../i18n";
import { PluginCard } from "./PluginCard";
import { PluginDetailPage } from "./PluginDetailPage";
import { PluginUpdatesSection } from "./PluginUpdatesSection";
import { usePlugins } from "./usePlugins";
import "./PluginsSettingsSection.css";

/**
 * The plugins page: the third-party switch, the plugins folder and each installed
 * plugin; or one plugin's own page once its Settings is opened. The market is its own page.
 */
export function PluginsSettingsSection({ initialOpenId = null }: { initialOpenId?: string | null } = {}) {
  const t = useTranslation();
  const {
    snapshot,
    error,
    busy,
    setAllowed,
    setEnabled,
    setSetting,
    setNotificationsMuted,
    setPreRelease,
    setMemoryLimit,
    revokeSensitive,
    clearData,
    reload,
    openFolder,
    runCommand,
    uninstall,
    setAutoUpdate,
    untrustPublisher,
    checkUpdates,
  } = usePlugins();
  // Opened from the market's Manage button: that plugin's own page.
  const [openId, setOpenId] = useState<string | null>(initialOpenId);
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
          onPreReleaseChange={(enabled) => setPreRelease(openPlugin.id, enabled)}
          onMemoryLimitChange={(megabytes) => setMemoryLimit(openPlugin.id, megabytes)}
          onClearData={() => clearData(openPlugin.id)}
          onRevokeSensitive={(permission) => revokeSensitive(openPlugin.id, permission)}
        />
        {error ? <p className="plugin-card__error">{error}</p> : null}
      </>
    );
  }

  return (
    <>
      <section className="settings-section plugins-panel">
        <ToggleControl label={t.settings.plugins.allowThirdParty} checked={allowed} onChange={(next) => !busy && setAllowed(next)} />
        <p className="settings-section__hint">{t.settings.plugins.warning}</p>
        <div className="plugins-folder">
          <span>{t.settings.plugins.folder}</span>
          {/* Right-to-left so a long path loses its start, not the plugins folder at its end. */}
          <code dir="rtl" title={snapshot?.pluginsDir}>
            <bdi>{snapshot?.pluginsDir ?? ""}</bdi>
          </code>
          <button
            className="plugin-card__button plugins-folder__icon"
            type="button"
            title={t.settings.plugins.openFolder}
            aria-label={t.settings.plugins.openFolder}
            onClick={openFolder}
          >
            <FolderOpen size={13} strokeWidth={2.4} />
          </button>
          <button
            className="plugin-card__button plugins-folder__icon"
            type="button"
            title={t.settings.plugins.reload}
            aria-label={t.settings.plugins.reload}
            disabled={busy}
            onClick={reload}
          >
            <RefreshCcw size={13} strokeWidth={2.4} />
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
      {snapshot ? (
        <PluginUpdatesSection
          snapshot={snapshot}
          busy={busy}
          onAutoUpdateChange={setAutoUpdate}
          onCheck={checkUpdates}
          onUntrust={untrustPublisher}
        />
      ) : null}
    </>
  );
}
