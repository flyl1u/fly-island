import { useState } from "react";
import { BadgeCheck, Download, ExternalLink, Flag, GitBranch } from "lucide-react";
import { useLocale, useTranslation } from "../../i18n";
import { MARKET_CATEGORIES, marketPublisher, openPluginHomepage, PLUGIN_PERMISSIONS, type MarketCategory, type MarketPlugin, type MarketSnapshot, type PluginPermission } from "./api";
import { repositoryUrl } from "./marketFilter";
import { NodeMissingHint } from "./NodeMissingHint";
import { isNewerVersion } from "./version";

const isPermission = (name: string): name is PluginPermission => (PLUGIN_PERMISSIONS as readonly string[]).includes(name);
const isCategory = (name: string): name is MarketCategory => (MARKET_CATEGORIES as readonly string[]).includes(name);
/** Where problems with market plugins are reported until the index repository has its own issues. */
const REPORT_URL = "https://github.com/TixXin/fly-island/issues/new";

/** One plugin on the market page: what it is, who publishes it, and Install / Update / its state. */
export function MarketPluginItem({
  plugin,
  market,
  installingId,
  onInstall,
}: {
  plugin: MarketPlugin;
  market: MarketSnapshot;
  installingId: string | null;
  /** `trust`: the user agreed to trust the publisher first. */
  onInstall: (id: string, trust: boolean) => void;
}) {
  const t = useTranslation();
  const text = t.settings.plugins.market;
  const { locale } = useLocale();
  const [open, setOpen] = useState(false);
  const publisher = marketPublisher(plugin, market);
  const official = publisher === market.officialPublisher;
  const trusted = official || market.trustedPublishers.includes(publisher);
  const repo = repositoryUrl(plugin.repo);
  const report = `${REPORT_URL}?title=${encodeURIComponent(`[plugin] ${plugin.id} ${plugin.version}`)}`;

  const action = () => {
    if (plugin.revoked) return <span className="plugin-market__state plugin-market__state--revoked">{text.revoked}</span>;
    if (plugin.incompatible) return <span className="plugin-market__state" title={plugin.incompatible}>{text.incompatible}</span>;
    const isUpdate = plugin.installedVersion !== null && isNewerVersion(plugin.version, plugin.installedVersion);
    if (plugin.installedVersion !== null && !isUpdate) return <span className="plugin-market__state">{text.installed}</span>;
    const label = installingId === plugin.id ? text.installing : !trusted ? text.trustAndInstall : isUpdate ? text.update(plugin.version) : text.install;
    return (
      <button
        className="plugin-card__button"
        type="button"
        title={trusted ? undefined : text.trustHint(publisher)}
        disabled={installingId !== null}
        onClick={() => onInstall(plugin.id, !trusted)}
      >
        <Download size={12} strokeWidth={2.4} />
        <span>{label}</span>
      </button>
    );
  };

  return (
    <article className="plugin-market__item">
      <div className="plugin-market__text">
        <strong title={plugin.id}>{plugin.name[locale]}</strong>
        <span className="plugin-market__meta">
          <span>v{plugin.version}</span>
          <span className={official ? "plugin-market__publisher plugin-market__publisher--official" : "plugin-market__publisher"}>
            {official ? <BadgeCheck size={11} strokeWidth={2.4} aria-hidden="true" /> : null}
            {official ? `${text.publisher(publisher)} · ${text.official}` : text.publisher(publisher)}
          </span>
          {plugin.webview ? (
            <span className="plugin-market__tag plugin-market__tag--custom" title={text.customUiHint}>
              {text.customUi}
            </span>
          ) : null}
          {plugin.categories.filter(isCategory).map((category) => (
            <span key={category} className="plugin-market__tag">
              {text.category[category]}
            </span>
          ))}
        </span>
        {plugin.description?.[locale] ? <p className={open ? undefined : "plugin-market__clamp"}>{plugin.description[locale]}</p> : null}
        {plugin.revoked ? <p className="plugin-card__error">{plugin.revoked[locale]}</p> : null}
        {!trusted && !plugin.revoked ? <p className="plugin-card__hint">{text.trustHint(publisher)}</p> : null}
        {open ? (
          <>
            <p>
              {t.settings.plugins.permissions}:{" "}
              {plugin.permissions.length === 0
                ? t.settings.plugins.noPermissions
                : plugin.permissions.map((name) => (isPermission(name) ? t.settings.plugins.permission[name] : name)).join(locale === "zh-CN" ? "、" : ", ")}
            </p>
            {plugin.runtime ? <p>{plugin.runtime === "node" ? t.settings.plugins.runtimeNode : t.settings.plugins.runtimeBuiltIn}</p> : null}
            <div className="plugin-market__links">
              {repo ? (
                <button className="plugin-card__button plugin-card__button--quiet" type="button" onClick={() => void openPluginHomepage(repo)}>
                  <GitBranch size={12} strokeWidth={2.4} />
                  <span>{text.repository}</span>
                </button>
              ) : null}
              {plugin.homepage.startsWith("https://") && plugin.homepage !== repo ? (
                <button className="plugin-card__button plugin-card__button--quiet" type="button" onClick={() => void openPluginHomepage(plugin.homepage)}>
                  <ExternalLink size={12} strokeWidth={2.4} />
                  <span>{t.settings.plugins.homepage}</span>
                </button>
              ) : null}
              <button className="plugin-card__button plugin-card__button--quiet" type="button" onClick={() => void openPluginHomepage(report)}>
                <Flag size={12} strokeWidth={2.4} />
                <span>{text.reportIssue}</span>
              </button>
            </div>
          </>
        ) : null}
        {plugin.runtime === "node" && !market.nodeAvailable ? <NodeMissingHint /> : null}
      </div>
      <div className="plugin-market__action">
        {action()}
        <button className="plugin-card__button plugin-card__button--quiet" type="button" aria-expanded={open} onClick={() => setOpen(!open)}>
          <span>{open ? text.hideDetails : text.details}</span>
        </button>
      </div>
    </article>
  );
}
