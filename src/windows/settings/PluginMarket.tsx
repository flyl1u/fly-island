import { useState } from "react";
import { Bot, Headphones, HeartPulse } from "lucide-react";
import {
  NATIVE_PLUGINS, NativePluginIcon, setNativePluginEnabled, setNativePluginInstalled, useNativePluginStates, type NativePluginId,
} from "../../features/plugins";
import { NATIVE_AGENTS } from "../../features/agent-status/nativeAgents";
import { OFFICE_SOURCES } from "../../features/messages/messagePreview";
import { useOfficeImEnabled } from "../../features/messages/office-im/useOfficeIm";
import type { IslandSettings } from "../../features/appearance/types";
import { setClockWeatherSettings } from "../../features/weather";
import { isNativePluginId, MARKET_PACKAGES, PACKAGED_MARKET_PLUGINS, type PackagedMarketId } from "../../features/plugins/native/catalog";
import { installPlugin, setPluginEnabled, uninstallPlugin } from "../../features/plugins/api";
import { pluginFailureCode, type PluginFailure } from "../../features/plugins/errors";
import { refreshPlugins, usePlugins } from "../../features/plugins/usePlugins";
import { clearPluginJob, runPluginJob, usePluginJobs } from "../../features/plugins/usePluginJobs";
import { isJobActive } from "../../features/plugins/jobs.ts";
import { useTranslation } from "../../i18n";
import { PluginMarketCard } from "./PluginMarketCard";
import "./PluginMarket.css";

const MARKET_CARDS = [...NATIVE_PLUGINS, ...PACKAGED_MARKET_PLUGINS];
const PACKAGE_ICONS = { minimax: Bot, "device-battery": Headphones, "eye-care": HeartPulse };

function PackageIcon({ id }: { id: PackagedMarketId }) {
  const Icon = PACKAGE_ICONS[id];
  return <span className="native-plugin-icon plugin-card__tile plugin-card__package" aria-hidden="true"><Icon size={28} strokeWidth={1.5} /></span>;
}

type PluginMarketProps = { settings: IslandSettings; onSettingsChange: (settings: IslandSettings) => void };

/** The built-in plugins as square cards: icon with name and author beside it, a short pitch and installation controls. */
export function PluginMarket({ settings, onSettingsChange }: PluginMarketProps) {
  const t = useTranslation().settings.plugins.market;
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
  const [, setOfficeEnabled] = useOfficeImEnabled();
  // Installing is asking for it: its own switch (Messages / Agent settings) goes on with it. A switch
  // left off from before, or turned off and forgotten, kept an installed plugin off the island
  // with nothing there to say why (2026-11-19, owner: 钉钉装好后岛上没有).
  const install = (id: NativePluginId) => {
    if (id === "clockWeather") setClockWeatherSettings({ showClock: true, showWeather: true });
    const office = OFFICE_SOURCES.find((source) => source === id);
    if (office) setOfficeEnabled(office, true);
    const agent = NATIVE_AGENTS.find((item) => item.id === id);
    if (agent) {
      // Its quota ring too, like the built-in agents' rings that start ticked.
      const ring = agent.id === "kimiCode" || agent.id === "zcode" || agent.id === "antigravity" ? agent.id : null;
      const quota = ring !== null && !settings.agentQuotaSources.includes(ring);
      if (!settings[agent.setting] || quota) {
        onSettingsChange({ ...settings, [agent.setting]: true, ...(quota ? { agentQuotaSources: [...settings.agentQuotaSources, ring] } : {}) });
      }
    }
    setNativePluginInstalled(id, true);
  };
  return <section className="plugin-market" aria-label={t.title}>
    <header className="plugin-market__header">
      <p className="plugin-market__hint">{t.hint}</p>
    </header>
    <ul className="plugin-market__grid">
      {MARKET_CARDS.map(({ id, accent, author }) => {
        const item = t.items[id];
        const isNative = isNativePluginId(id);
        const p = registry.installed[id];
        const isInstalled = isNative ? installed[id] : Boolean(p && !p.development);
        const isEnabled = isNative ? enabled[id] : isInstalled && p?.enabled === true;
        const inDevelopment = !isNative && !isInstalled && !MARKET_PACKAGES.some((plugin) => plugin.id === id);
        const status = live[id]?.status;
        const job = isNative ? undefined : jobs[id];
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
        return <PluginMarketCard key={id} name={item.name} description={item.description} accent={accent} author={author}
          icon={isNative ? <NativePluginIcon id={id} size={44} className="plugin-card__tile" /> : <PackageIcon id={id} />}
          installed={isInstalled} enabled={isEnabled} inDevelopment={inDevelopment}
          job={isJobActive(job) ? job : undefined} switching={!isNative && switching === id}
          reason={reason}
          onRetry={!isNative && job?.phase === "failed" ? () => changePackage(id, job.error === "plugin_uninstall_failed") : undefined}
          onToggle={toggle} onChangeInstallation={changeInstallation} />;
      })}
    </ul>
  </section>;
}
