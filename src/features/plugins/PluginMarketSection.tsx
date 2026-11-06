import { useMemo, useState } from "react";
import { RefreshCcw } from "lucide-react";
import { useLocale, useTranslation } from "../../i18n";
import { MARKET_CATEGORIES, type MarketCategory, type MarketPlugin, type PluginsSnapshot } from "./api";
import { filterMarketPlugins, usedCategories } from "./marketFilter";
import { groupMarketPlugins } from "./marketGroups";
import { MarketPluginItem } from "./MarketPluginItem";
import { usePluginMarket } from "./usePluginMarket";
import "./PluginMarketSection.css";

const time = (at: number) => new Date(at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });

/**
 * Plugins from the market index: a status line with Refresh, search and
 * categories, then the plugins that can be installed and below them the
 * installed ones. `onManage` opens an installed plugin on the plugins page.
 */
export function PluginMarketSection({ onInstalled, onManage }: { onInstalled?: (snapshot: PluginsSnapshot) => void; onManage?: (id: string) => void } = {}) {
  const t = useTranslation();
  const text = t.settings.plugins.market;
  const { locale } = useLocale();
  const { market, loadedAt, loading, loadError, installError, installingId, refresh, install } = usePluginMarket(onInstalled);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<MarketCategory | "">("");
  const failedPlugin = installError && market?.plugins.find((plugin) => plugin.id === installError.id);
  const categories = useMemo(() => (market ? usedCategories(market.plugins, MARKET_CATEGORIES) : []), [market]);
  const shown = useMemo(
    () => (market ? filterMarketPlugins(market.plugins, { query, category }, market.officialPublisher) : []),
    [market, query, category],
  );
  const groups = useMemo(() => groupMarketPlugins(shown), [shown]);
  const hasPlugins = Boolean(market && market.plugins.length > 0);
  const status = loading
    ? text.refreshing
    : market
      ? loadedAt !== null
        ? text.status(market.plugins.length, time(loadedAt))
        : text.statusCount(market.plugins.length)
      : "";
  const renderGroup = (title: string, plugins: MarketPlugin[]) =>
    plugins.length > 0 ? (
      <div className="plugin-market__group" role="group" aria-label={title}>
        <h3 className="plugin-market__group-title">{title}</h3>
        {market
          ? plugins.map((plugin) => (
              <MarketPluginItem
                key={plugin.id}
                plugin={plugin}
                market={market}
                installingId={installingId}
                onInstall={(id, trust, acceptKeyChange) => void install(id, trust, acceptKeyChange)}
                onManage={onManage}
              />
            ))
          : null}
      </div>
    ) : null;
  // Search and categories stay in place while the list loads; only an index that is known to be empty hides them.
  const showFilters = hasPlugins || (market === null && !loadError);

  return (
    <section className="settings-section plugins-panel">
      {/* The page title already says Plugin market: this line says what was loaded and when. */}
      <div className="plugin-market__header">
        <span className="plugin-market__status" aria-live="polite">
          {status}
        </span>
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
        {renderGroup(text.groupInstallable(groups.installable.length), groups.installable)}
        {renderGroup(text.groupInstalled(groups.installed.length), groups.installed)}
      </div>
    </section>
  );
}
