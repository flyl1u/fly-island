import { useMemo, useState } from "react";
import { RefreshCcw } from "lucide-react";
import { useLocale, useTranslation } from "../../i18n";
import { MARKET_CATEGORIES, type MarketCategory, type PluginsSnapshot } from "./api";
import { filterMarketPlugins, usedCategories } from "./marketFilter";
import { MarketPluginItem } from "./MarketPluginItem";
import { usePluginMarket } from "./usePluginMarket";
import "./PluginMarketSection.css";

/** Plugins from the market index: search, categories, and each with Install, Update or its state. */
export function PluginMarketSection({ onInstalled }: { onInstalled?: (snapshot: PluginsSnapshot) => void } = {}) {
  const t = useTranslation();
  const text = t.settings.plugins.market;
  const { locale } = useLocale();
  const { market, loading, loadError, installError, installingId, refresh, install } = usePluginMarket(onInstalled);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<MarketCategory | "">("");
  const failedPlugin = installError && market?.plugins.find((plugin) => plugin.id === installError.id);
  const categories = useMemo(() => (market ? usedCategories(market.plugins, MARKET_CATEGORIES) : []), [market]);
  const shown = useMemo(
    () => (market ? filterMarketPlugins(market.plugins, { query, category }, market.officialPublisher) : []),
    [market, query, category],
  );
  const hasPlugins = Boolean(market && market.plugins.length > 0);
  // Search and categories stay in place while the list loads; only an index that is known to be empty hides them.
  const showFilters = hasPlugins || (market === null && !loadError);

  return (
    <section className="settings-section plugins-panel">
      <div className="settings-section__header plugin-market__header">
        <span>{text.title}</span>
        <button className="plugin-card__button" type="button" disabled={loading} onClick={() => void refresh()}>
          <RefreshCcw className={loading ? "plugin-market__spin" : undefined} size={12} strokeWidth={2.4} />
          <span>{text.refresh}</span>
        </button>
      </div>
      <p className="settings-section__hint">{text.hint}</p>
      {loadError ? (
        <div className="plugin-market__failure" role="alert">
          <p className="plugin-card__error">{text.loadFailed}</p>
          <p className="plugin-market__detail">{loadError}</p>
        </div>
      ) : null}
      {installError ? (
        <div className="plugin-market__failure" role="alert">
          <p className="plugin-card__error">{text.installFailed(failedPlugin ? failedPlugin.name[locale] : installError.id)}</p>
          <p className="plugin-market__detail">{installError.detail}</p>
        </div>
      ) : null}
      {market && !hasPlugins ? <p className="settings-section__hint">{text.empty}</p> : null}
      {showFilters ? (
        <div className="plugin-market__filters">
          <input
            className="plugin-setting__input"
            type="search"
            value={query}
            placeholder={text.search}
            aria-label={text.search}
            onChange={(event) => setQuery(event.currentTarget.value)}
          />
          {market === null || categories.length > 0 ? (
            <div className="plugin-market__categories" role="group">
              {(["", ...categories] as const).map((name) => (
                <button
                  key={name || "all"}
                  className="plugin-card__button plugin-market__category"
                  type="button"
                  aria-pressed={category === name}
                  onClick={() => setCategory(name)}
                >
                  <span>{name === "" ? text.allCategories : text.category[name]}</span>
                </button>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
      <div className="plugin-market__list" aria-busy={loading}>
        {market === null && loading ? (
          <>
            <p className="settings-section__hint">{text.loading}</p>
            {[0, 1, 2].map((index) => (
              <div key={index} className="plugin-market__item plugin-market__placeholder" aria-hidden="true" />
            ))}
          </>
        ) : null}
        {hasPlugins && shown.length === 0 ? <p className="settings-section__hint">{text.noMatches}</p> : null}
        {market
          ? shown.map((plugin) => (
              <MarketPluginItem
                key={plugin.id}
                plugin={plugin}
                market={market}
                installingId={installingId}
                onInstall={(id, trust, acceptKeyChange) => void install(id, trust, acceptKeyChange)}
              />
            ))
          : null}
      </div>
    </section>
  );
}
