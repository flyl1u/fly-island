import type { CSSProperties } from "react";
import { Check } from "lucide-react";
import { NATIVE_PLUGINS, NativePluginIcon, setNativePluginInstalled, useNativePlugins } from "../../features/plugins";
import { useTranslation } from "../../i18n";
import "./PluginMarket.css";

/** The built-in plugins as square cards: icon, name, a two-line pitch and one action. */
export function PluginMarket() {
  const t = useTranslation().settings.plugins.market;
  const installed = useNativePlugins();
  return <section className="plugin-market" aria-labelledby="plugin-market-title">
    <header className="plugin-market__header">
      <h2 id="plugin-market-title" className="plugin-market__title">{t.title}</h2>
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
            onClick={() => setNativePluginInstalled(id, !on)}
          >
            {on ? <><span className="plugin-card__state">{t.installed}</span><span className="plugin-card__remove">{t.uninstall}</span></> : t.install}
          </button>
        </li>;
      })}
    </ul>
  </section>;
}
