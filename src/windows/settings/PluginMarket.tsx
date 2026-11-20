import type { CSSProperties } from "react";
import { Check } from "lucide-react";
import { NATIVE_PLUGINS, NativePluginIcon, setNativePluginInstalled, useNativePlugins, type NativePluginId } from "../../features/plugins";
import { NATIVE_AGENTS } from "../../features/agent-status/nativeAgents";
import { OFFICE_SOURCES } from "../../features/messages/messagePreview";
import { useOfficeImEnabled } from "../../features/messages/office-im/useOfficeIm";
import type { IslandSettings } from "../../features/appearance/types";
import { ClockWeatherSettingsGroup, setClockWeatherSettings, useClockWeather } from "../../features/weather";
import { useTranslation } from "../../i18n";
import "./PluginMarket.css";

type PluginMarketProps = { settings: IslandSettings; onSettingsChange: (settings: IslandSettings) => void };

/** The built-in plugins as square cards: icon, name, a two-line pitch and one action. */
export function PluginMarket({ settings, onSettingsChange }: PluginMarketProps) {
  const t = useTranslation().settings.plugins.market;
  const installed = useNativePlugins();
  const clockWeather = useClockWeather();
  const [, setOfficeEnabled] = useOfficeImEnabled();
  // Installing is asking for it: its own switch (Messages / Agent settings) goes on with it. A switch
  // left off from before, or turned off and forgotten, kept an installed plugin off the island
  // with nothing there to say why (2026-11-19, owner: 钉钉装好后岛上没有).
  const install = (id: NativePluginId) => {
    if (id === "clockWeather") setClockWeatherSettings({ ...clockWeather.settings, showClock: true, showWeather: true });
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
  return <><section className="plugin-market" aria-label={t.title}>
    <header className="plugin-market__header">
      <p className="plugin-market__hint">{t.hint}</p>
    </header>
    <ul className="plugin-market__grid">
      {NATIVE_PLUGINS.map(({ id, kind, accent }) => {
        const item = t.items[id];
        const on = installed[id];
        return <li key={id} className={`plugin-card${on ? " plugin-card--installed" : ""}`} style={{ "--plugin-accent": accent } as CSSProperties}>
          <div className="plugin-card__top">
            <span className="plugin-card__icon">
              <NativePluginIcon id={id} size={44} className="plugin-card__tile" />
              {on && <span className="plugin-card__check" aria-hidden="true"><Check size={10} strokeWidth={3} /></span>}
            </span>
            <span className="plugin-card__kind">{t.kinds[kind]}</span>
          </div>
          <div className="plugin-card__text">
            <h3 className="plugin-card__name">{item.name}</h3>
            <p className="plugin-card__description">{item.description}</p>
          </div>
          <button
            type="button"
            className={`plugin-card__action${on ? " plugin-card__action--remove" : ""}`}
            aria-label={on ? t.uninstallNamed(item.name) : t.installNamed(item.name)}
            onClick={() => on ? setNativePluginInstalled(id, false) : install(id)}
          >
            {on ? <><span className="plugin-card__state">{t.installed}</span><span className="plugin-card__remove">{t.uninstall}</span></> : t.install}
          </button>
        </li>;
      })}
    </ul>
  </section>
    {installed.clockWeather && <ClockWeatherSettingsGroup />}
  </>;
}
