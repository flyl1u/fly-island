import { useState } from "react";
import {
  NATIVE_PLUGINS, setNativePluginEnabled, setNativePluginInstalled, useNativePluginStates, type NativePluginId,
} from "../../features/plugins";
import { NATIVE_AGENTS } from "../../features/agent-status/nativeAgents";
import { OFFICE_SOURCES } from "../../features/messages/messagePreview";
import { useOfficeImEnabled } from "../../features/messages/office-im/useOfficeIm";
import type { IslandSettings } from "../../features/appearance/types";
import { setCenteredClockSettings, DEFAULT_CENTERED_CLOCK_SETTINGS } from "../../features/centered-clock";
import { configureScreenshotPlugin } from "../../features/screenshot/api";
import { updateScreenshotSettings } from "../../features/screenshot/useScreenshotSettings";
import { loadScreenshotSettings } from "../../features/screenshot/storage";
import { setClockWeatherSettings } from "../../features/weather";
import { isNativePluginId, MARKET_PACKAGES, PACKAGED_MARKET_PLUGINS, type PackagedMarketId } from "../../features/plugins/native/catalog";
import { PluginIcon } from "../../features/plugins/PluginIcon";
import type { PlacedPlugin } from "../../features/plugins/placement.ts";
import { usePlacedPlugins } from "../../features/plugins/usePlacedPlugins";
import { usePluginUpdates } from "../../features/plugins/usePluginUpdates";
import { SettingsLinkButton } from "../../components/settings/SettingsLinkButton";
import { installPlugin, setPluginEnabled, uninstallPlugin } from "../../features/plugins/api";
import { pluginFailureCode, type PluginFailure } from "../../features/plugins/errors";
import { refreshPlugins, usePlugins } from "../../features/plugins/usePlugins";
import { clearPluginJob, runPluginJob, usePluginJobs } from "../../features/plugins/usePluginJobs";
import { isJobActive } from "../../features/plugins/jobs.ts";
import { orderMarketCards } from "../../features/plugins/marketOrder.ts";
import { useTranslation } from "../../i18n";
import { PluginMarketCard } from "./PluginMarketCard";
import "./PluginMarket.css";

const MARKET_CARDS = [...NATIVE_PLUGINS, ...PACKAGED_MARKET_PLUGINS];
type PluginMarketProps = {
  settings: IslandSettings;
  onSettingsChange: (settings: IslandSettings) => void;
  /** Goes to the page, and group, a plugin's settings were placed on. */
  onOpenSettings: (plugin: PlacedPlugin) => void;
};

/**
 * The built-in plugins as square cards, installed ones first: icon and name, the authors, a short
 * pitch and installation controls. No plugin's settings are drawn here; each card links to where they were placed.
 */
export function PluginMarket({ settings, onSettingsChange, onOpenSettings }: PluginMarketProps) {
  const text = useTranslation().settings.plugins;
  const t = text.market;
  const placed = usePlacedPlugins();
  const updates = usePluginUpdates();
  const { installed, enabled } = useNativePluginStates();
  const { registry, live } = usePlugins();
  const jobs = usePluginJobs();
  const [switching, setSwitching] = useState<PackagedMarketId | null>(null);
  const [error, setError] = useState<{ id: PackagedMarketId; code?: PluginFailure } | null>(null);
  const switchPackage = async (id: PackagedMarketId, checked: boolean) => {
    if (switching) return;
    setSwitching(id);
    setError(null);
    clearPluginJob(id);
    try { await setPluginEnabled(id, checked); }
    catch (failure) {
      setError({ id, code: pluginFailureCode(failure) });
    } finally {
      await refreshPlugins();
      setSwitching(null);
    }
  };
  const changePackage = (id: PackagedMarketId, remove: boolean) => {
    setError(null);
    void runPluginJob(id, remove ? "uninstalling" : "downloading", () => remove ? uninstallPlugin(id) : installPlugin(id, true));
  };
  // Updating keeps the plugin as it is: switched on or off.
  const updatePackage = (id: PackagedMarketId) => {
    setError(null);
    void runPluginJob(id, "downloading", () => installPlugin(id));
  };
  const [, setOfficeEnabled] = useOfficeImEnabled();
  // Installing is asking for it: its own switch (Messages / Agent settings) goes on with it. A switch
  // left off from before, or turned off and forgotten, kept an installed plugin off the island
  // with nothing there to say why (2026-11-19, owner: 钉钉装好后岛上没有).
  const install = (id: NativePluginId) => {
    if (id === "centeredClock") setCenteredClockSettings(DEFAULT_CENTERED_CLOCK_SETTINGS);
    if (id === "appleMusicLyrics") onSettingsChange({ ...settings, lyricsAppleMusic: true });
    if (id === "clockWeather") setClockWeatherSettings({ showClock: true, showWeather: true });
    const office = OFFICE_SOURCES.find((source) => source === id);
    if (office) setOfficeEnabled(office, true);
    const agent = NATIVE_AGENTS.find((item) => item.id === id);
    if (agent) {
      // Its quota ring too, like the built-in agents' rings that start ticked.
      const ring = agent.id === "kimiCode" || agent.id === "zcode" || agent.id === "antigravity" || agent.id === "relay" ? agent.id : null;
      const quota = ring !== null && !settings.agentQuotaSources.includes(ring);
      if (!settings[agent.setting] || quota) {
        onSettingsChange({ ...settings, [agent.setting]: true, ...(quota ? { agentQuotaSources: [...settings.agentQuotaSources, ring] } : {}) });
      }
    }
    setNativePluginInstalled(id, true);
    if (id === "screenshot") {
      const config = loadScreenshotSettings();
      void configureScreenshotPlugin(true, config.shortcutEnabled ? config.shortcut : "").catch((error: unknown) => {
        setNativePluginEnabled("screenshot", false);
        updateScreenshotSettings({ shortcutIssue: { shortcut: config.shortcut, reason: String(error) } });
        const target = { id, native: id, category: "screenshot", actionsCategory: "screenshot", standalone: true } as const;
        onOpenSettings(target);
      });
    }
  };
  const packagesInstalled = PACKAGED_MARKET_PLUGINS.filter(({ id }) => registry.installed[id]?.development === false);
  const newVersion = (id: string) => {
    const published = updates.versions?.[id];
    const current = registry.installed[id];
    return published && current && !current.development && published !== current.manifest.version ? published : undefined;
  };
  const isCardInstalled = (id: (typeof MARKET_CARDS)[number]["id"]) =>
    isNativePluginId(id) ? installed[id] : registry.installed[id]?.development === false;
  // The order as last drawn, so a card with a running job can keep its place.
  const [shown, setShown] = useState<readonly string[]>([]);
  const activeIds = new Set(Object.values(jobs).filter(isJobActive).map((job) => job.id));
  const cards = orderMarketCards(MARKET_CARDS, isCardInstalled, activeIds, shown);
  if (cards.map(({ id }) => id).join() !== shown.join()) setShown(cards.map(({ id }) => id));
  return <section className="plugin-market" aria-label={t.title}>
    <header className="plugin-market__header">
      <p className="plugin-market__hint">{t.hint}</p>
      {packagesInstalled.length > 0 && <p className="plugin-market__updates" role="status">
        <SettingsLinkButton disabled={updates.checking} onClick={() => { void updates.check(); }}>{text.checkUpdate}</SettingsLinkButton>
        {updates.failure ? <span>{t.failure[updates.failure]}</span>
          : updates.versions && !packagesInstalled.some(({ id }) => newVersion(id)) && <span>{t.upToDate}</span>}
      </p>}
    </header>
    <ul className="plugin-market__grid">
      {cards.map(({ id, accent, authors }) => {
        const item = t.items[id];
        const isNative = isNativePluginId(id);
        const p = registry.installed[id];
        const isInstalled = isCardInstalled(id);
        const isEnabled = isNative ? enabled[id] : isInstalled && p?.enabled === true;
        const inDevelopment = !isNative && !isInstalled && !MARKET_PACKAGES.some((plugin) => plugin.id === id);
        const status = live[id]?.status;
        const job = isNative ? undefined : jobs[id];
        // A disabled screenshot with an occupied shortcut still needs its repair actions.
        const target = placed.find((plugin) => plugin.id === id) ?? (id === "screenshot" && isInstalled
          ? { id, native: id, category: "screenshot", actionsCategory: "screenshot", standalone: true } as const : undefined);
        const version = newVersion(id);
        const failure = job?.phase === "failed" ? pluginFailureCode(job.error) : error?.id === id ? error.code : undefined;
        const failed = job?.phase === "failed" || error?.id === id;
        const reason = failed ? (failure ? t.failure[failure] : t.operationFailed(item.name))
          : !isNative && isEnabled && (status === "failed" || status === "restarting") ? t.failure.plugin_start_failed : null;
        const toggle = (checked: boolean) => {
          if (isNative) setNativePluginEnabled(id, checked);
          else void switchPackage(id, checked);
        };
        const changeInstallation = () => {
          if (!isNative) changePackage(id, isInstalled);
          else if (isInstalled) setNativePluginInstalled(id, false);
          else install(id);
        };
        return <PluginMarketCard key={id} name={item.name} description={item.description} accent={accent} authors={authors}
          icon={<PluginIcon id={id} size={44} className="plugin-card__tile" />}
          onOpenSettings={target && isInstalled ? () => onOpenSettings(target) : undefined}
          update={!isNative && version ? { version, onUpdate: () => updatePackage(id) } : undefined}
          installed={isInstalled} enabled={isEnabled} inDevelopment={inDevelopment}
          job={isJobActive(job) ? job : undefined} switching={!isNative && switching === id}
          reason={reason}
          onRetry={!isNative && job?.phase === "failed" ? () => changePackage(id, job.error === "plugin_uninstall_failed") : undefined}
          onToggle={toggle} onChangeInstallation={changeInstallation} />;
      })}
    </ul>
  </section>;
}
