import { useState } from "react";
import { FolderOpen, RefreshCcw } from "lucide-react";
import { SettingsGroup } from "../../components/settings/SettingsGroup";
import { SettingsRow } from "../../components/settings/SettingsRow";
import { SettingsToggleRow } from "../../components/settings/SettingsToggleRow";
import { useTranslation } from "../../i18n";
import type { PluginInfo } from "./api";
import { PluginCard } from "./PluginCard";
import { PluginDetailPage } from "./PluginDetailPage";
import { PluginUpdatesSection } from "./PluginUpdatesSection";
import { usePlugins } from "./usePlugins";
import "./PluginsSettingsSection.css";

/**
 * The plugins page: the third-party switch and the plugins folder, then the installed plugins,
 * third-party and built-in apart, two cards a row; or one plugin's own page once a card is
 * opened. The market is its own page.
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

  const plugins = snapshot?.plugins ?? [];
  const renderGroup = (title: string, group: PluginInfo[]) =>
    snapshot && group.length > 0 ? (
      <section className="plugins-list" aria-label={title}>
        <h3 className="plugins-list__title">{title}</h3>
        <div className="plugins-list__grid">
          {group.map((plugin) => (
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
        </div>
      </section>
    ) : null;
  const thirdParty = plugins.filter((plugin) => !plugin.builtin);
  const builtin = plugins.filter((plugin) => plugin.builtin);

  return (
    <>
      <SettingsGroup footer={t.settings.plugins.warning}>
        <SettingsToggleRow title={t.settings.plugins.allowThirdParty} checked={allowed} onChange={(next) => !busy && setAllowed(next)} />
        <SettingsRow
          title={t.settings.plugins.folder}
          description={
            // Right-to-left so a long path loses its start, not the plugins folder at its end.
            <code className="plugins-folder__path" dir="rtl">
              <bdi>{snapshot?.pluginsDir ?? ""}</bdi>
            </code>
          }
          control={
            <>
              <button
                className="plugin-card__button plugins-folder__icon"
                type="button"
                aria-label={t.settings.plugins.openFolder}
                onClick={openFolder}
              >
                <FolderOpen size={13} strokeWidth={2.4} />
              </button>
              <button
                className="plugin-card__button plugins-folder__icon"
                type="button"
                aria-label={t.settings.plugins.reload}
                disabled={busy}
                onClick={reload}
              >
                <RefreshCcw size={13} strokeWidth={2.4} />
              </button>
            </>
          }
        />
      </SettingsGroup>
      {error ? <p className="plugin-card__error">{error}</p> : null}
      {snapshot && plugins.length === 0 ? <p className="settings-section__hint">{t.settings.plugins.empty}</p> : null}
      {renderGroup(t.settings.plugins.groupThirdParty(thirdParty.length), thirdParty)}
      {renderGroup(t.settings.plugins.groupBuiltin(builtin.length), builtin)}
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
