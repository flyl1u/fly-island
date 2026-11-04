import { Download, RefreshCcw } from "lucide-react";
import { useLocale, useTranslation } from "../../i18n";
import { PLUGIN_PERMISSIONS, type MarketPlugin, type PluginPermission, type PluginsSnapshot } from "./api";
import { NodeMissingHint } from "./NodeMissingHint";
import { usePluginMarket } from "./usePluginMarket";
import { isNewerVersion } from "./version";
import "./PluginMarketSection.css";

const isPermission = (name: string): name is PluginPermission =>
  (PLUGIN_PERMISSIONS as readonly string[]).includes(name);

/** Plugins from the market index, each with Install, Update or its state. */
export function PluginMarketSection({ onInstalled }: { onInstalled: (snapshot: PluginsSnapshot) => void }) {
  const t = useTranslation();
  const { locale } = useLocale();
  const { market, loading, loadError, installError, installingId, refresh, install } = usePluginMarket(onInstalled);
  const failedPlugin = installError && market?.plugins.find((plugin) => plugin.id === installError.id);

  const action = (plugin: MarketPlugin) => {
    if (plugin.incompatible) {
      return <span className="plugin-market__state" title={plugin.incompatible}>{t.settings.plugins.market.incompatible}</span>;
    }
    const isUpdate = plugin.installedVersion !== null && isNewerVersion(plugin.version, plugin.installedVersion);
    if (plugin.installedVersion !== null && !isUpdate) {
      return <span className="plugin-market__state">{t.settings.plugins.market.installed}</span>;
    }
    return (
      <button className="plugin-card__button" type="button" disabled={installingId !== null} onClick={() => void install(plugin.id)}>
        <Download size={12} strokeWidth={2.4} />
        <span>
          {installingId === plugin.id
            ? t.settings.plugins.market.installing
            : isUpdate
              ? t.settings.plugins.market.update(plugin.version)
              : t.settings.plugins.market.install}
        </span>
      </button>
    );
  };

  return (
    <section className="settings-section plugins-panel">
      <div className="settings-section__header plugin-market__header">
        <span>{t.settings.plugins.market.title}</span>
        <button className="plugin-card__button" type="button" disabled={loading} onClick={() => void refresh()}>
          <RefreshCcw size={12} strokeWidth={2.4} />
          <span>{t.settings.plugins.market.refresh}</span>
        </button>
      </div>
      <p className="settings-section__hint">{t.settings.plugins.market.hint}</p>
      {loading ? <p className="settings-section__hint">{t.settings.plugins.market.loading}</p> : null}
      {loadError ? (
        <div className="plugin-market__failure" role="alert">
          <p className="plugin-card__error">{t.settings.plugins.market.loadFailed}</p>
          <p className="plugin-market__detail">{loadError}</p>
        </div>
      ) : null}
      {installError ? (
        <div className="plugin-market__failure" role="alert">
          <p className="plugin-card__error">
            {t.settings.plugins.market.installFailed(failedPlugin ? failedPlugin.name[locale] : installError.id)}
          </p>
          <p className="plugin-market__detail">{installError.detail}</p>
        </div>
      ) : null}
      {market && market.plugins.length === 0 ? <p className="settings-section__hint">{t.settings.plugins.market.empty}</p> : null}
      {market?.plugins.map((plugin) => (
        <article className="plugin-market__item" key={plugin.id}>
          <div className="plugin-market__text">
            <strong title={plugin.id}>{plugin.name[locale]}</strong>
            <span>
              {[`v${plugin.version}`, plugin.author && t.settings.plugins.by(plugin.author)].filter(Boolean).join(" · ")}
            </span>
            {plugin.description?.[locale] ? <p>{plugin.description[locale]}</p> : null}
            <p>
              {t.settings.plugins.permissions}:{" "}
              {plugin.permissions.length === 0
                ? t.settings.plugins.noPermissions
                : plugin.permissions
                    .map((permission) => (isPermission(permission) ? t.settings.plugins.permission[permission] : permission))
                    .join(locale === "zh-CN" ? "、" : ", ")}
            </p>
            {plugin.runtime ? (
              <p>{plugin.runtime === "node" ? t.settings.plugins.runtimeNode : t.settings.plugins.runtimeBuiltIn}</p>
            ) : null}
            {plugin.runtime === "node" && !market.nodeAvailable ? <NodeMissingHint /> : null}
          </div>
          <div className="plugin-market__action">{action(plugin)}</div>
        </article>
      ))}
    </section>
  );
}
