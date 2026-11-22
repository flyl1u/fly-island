import { useState, type CSSProperties } from "react";
import { Bot, Check, Headphones, HeartPulse } from "lucide-react";
import { openUrl } from "@tauri-apps/plugin-opener";
import {
  NATIVE_PLUGINS, NativePluginIcon, setNativePluginEnabled, setNativePluginInstalled, useNativePluginStates, type NativePluginId,
} from "../../features/plugins";
import { SettingsSwitch } from "../../components/settings/SettingsSwitch";
import { NATIVE_AGENTS } from "../../features/agent-status/nativeAgents";
import { OFFICE_SOURCES } from "../../features/messages/messagePreview";
import { useOfficeImEnabled } from "../../features/messages/office-im/useOfficeIm";
import type { IslandSettings } from "../../features/appearance/types";
import { setClockWeatherSettings } from "../../features/weather";
import { isNativePluginId, MARKET_PACKAGES, PACKAGED_MARKET_PLUGINS, type PackagedMarketId } from "../../features/plugins/native/catalog";
import { installPlugin, setPluginEnabled, uninstallPlugin } from "../../features/plugins/api";
import { refreshPlugins, usePlugins } from "../../features/plugins/usePlugins";
import { useTranslation } from "../../i18n";
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
  const { registry } = usePlugins();
  const [busy, setBusy] = useState<PackagedMarketId | null>(null);
  const [error, setError] = useState("");
  const withPackage = async (id: PackagedMarketId, change: () => Promise<void>) => {
    if (busy) return;
    setBusy(id);
    setError("");
    try { await change(); }
    catch (failure) {
      console.error("Plugin operation failed", failure);
      setError(t.operationFailed(t.items[id].name));
    } finally {
      await refreshPlugins();
      setBusy(null);
    }
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
      const ring = agent.id === "kimiCode" || agent.id === "zcode" ? agent.id : null;
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
        const toggle = (checked: boolean) => {
          if (isNative) setNativePluginEnabled(id, checked);
          else void withPackage(id, () => setPluginEnabled(id, checked));
        };
        const changeInstallation = () => {
          if (isNative) {
            if (isInstalled) setNativePluginInstalled(id, false);
            else install(id);
            return;
          }
          void withPackage(id, async () => {
            if (isInstalled) await uninstallPlugin(id);
            else {
              await installPlugin(id);
              await setPluginEnabled(id, true);
            }
          });
        };
        const stateClass = isInstalled ? ` plugin-card--installed${isEnabled ? "" : " plugin-card--disabled"}` : "";
        return <li key={id} className={`plugin-card${stateClass}`} style={{ "--plugin-accent": accent } as CSSProperties}>
          <div className="plugin-card__top">
            <span className="plugin-card__icon">
              {isNative ? <NativePluginIcon id={id} size={44} className="plugin-card__tile" /> : <PackageIcon id={id} />}
              {isInstalled && <span className="plugin-card__check" aria-hidden="true"><Check size={10} strokeWidth={3} /></span>}
            </span>
            <div className="plugin-card__heading">
              <h3 className="plugin-card__name">{item.name}</h3>
              <p className="plugin-card__author">
                {t.by}{" "}
                <a className="plugin-card__author-link" href={author.url}
                  onClick={(event) => { event.preventDefault(); void openUrl(author.url).catch(console.error); }}>@{author.name}</a>
              </p>
            </div>
          </div>
          <p className="plugin-card__description">{item.description}</p>
          <div className="plugin-card__footer">
            {isInstalled && <SettingsSwitch
              size="small"
              ariaLabel={t.enableNamed(item.name)}
              checked={isEnabled}
              disabled={!isNative && busy !== null}
              onChange={toggle}
            />}
            {inDevelopment ? <button type="button" className="plugin-card__action plugin-card__action--preview" disabled>
              {t.inDevelopment}
            </button> : <button
              type="button"
              className={`plugin-card__action${isInstalled ? " plugin-card__action--remove" : ""}`}
              aria-label={isInstalled ? t.uninstallNamed(item.name) : t.installNamed(item.name)}
              disabled={!isNative && busy !== null}
              aria-busy={busy === id || undefined}
              onClick={changeInstallation}
            >
              {isInstalled ? <><span className="plugin-card__state">{t.installed}</span><span className="plugin-card__remove">{t.uninstall}</span></> : t.install}
            </button>}
          </div>
        </li>;
      })}
    </ul>
    {error && <p className="plugins-settings__error" role="alert">{error}</p>}
  </section>;
}
