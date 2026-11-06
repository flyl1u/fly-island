import { useState } from "react";
import { BadgeCheck, Download, ExternalLink, Flag, GitBranch, KeyRound } from "lucide-react";
import { Markdown } from "../../components/markdown/Markdown";
import { useLocale, useTranslation } from "../../i18n";
import { MARKET_CATEGORIES, marketPublisher, openPluginHomepage, PLUGIN_PERMISSIONS, type MarketCategory, type MarketPlugin, type MarketSnapshot, type PluginPermission } from "./api";
import { repositoryUrl } from "./marketFilter";
import { NodeMissingHint } from "./NodeMissingHint";
import { isNewerVersion } from "./version";

const isPermission = (name: string): name is PluginPermission => (PLUGIN_PERMISSIONS as readonly string[]).includes(name);
const isCategory = (name: string): name is MarketCategory => (MARKET_CATEGORIES as readonly string[]).includes(name);
/** Where problems are reported for plugins whose index entry names no repository. */
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
  /** `trust`: the user agreed to trust the publisher first. `acceptKeyChange`: the user confirmed a new author key. */
  onInstall: (id: string, trust: boolean, acceptKeyChange: boolean) => void;
}) {
  const t = useTranslation();
  const text = t.settings.plugins.market;
  const { locale } = useLocale();
  const [open, setOpen] = useState(false);
  // An update on another author key takes two clicks: "update anyway", then "confirm".
  const [confirmingKeyChange, setConfirmingKeyChange] = useState(false);
  const publisher = marketPublisher(plugin, market);
  const official = publisher === market.officialPublisher;
  const trusted = official || market.trustedPublishers.includes(publisher);
  const repo = repositoryUrl(plugin.repo);
  // A plugin's own repository takes its problem reports; the island's repository takes the rest.
  const report = `${repo ? `${repo}/issues/new` : REPORT_URL}?title=${encodeURIComponent(`[plugin] ${plugin.id} ${plugin.version}`)}`;
  const openLink = (href: string) => void openPluginHomepage(href);

  const action = () => {
    if (plugin.revoked) return <span className="plugin-market__state plugin-market__state--revoked">{text.revoked}</span>;
    if (plugin.incompatible) return <span className="plugin-market__state" title={plugin.incompatible}>{text.incompatible}</span>;
    const isUpdate = plugin.installedVersion !== null && isNewerVersion(plugin.version, plugin.installedVersion);
    if (plugin.installedVersion !== null && !isUpdate) return <span className="plugin-market__state">{text.installed}</span>;
    const keyChanged = isUpdate && plugin.signingKeyChanged;
    if (keyChanged && confirmingKeyChange) {
      return (
        <>
          <button
            className="plugin-card__button plugin-card__button--danger"
            type="button"
            disabled={installingId !== null}
            onClick={() => {
              setConfirmingKeyChange(false);
              onInstall(plugin.id, !trusted, true);
            }}
          >
            <span>{text.confirmKeyChange}</span>
          </button>
          <button className="plugin-card__button plugin-card__button--quiet" type="button" onClick={() => setConfirmingKeyChange(false)}>
            <span>{text.cancel}</span>
          </button>
        </>
      );
    }
    const label = installingId === plugin.id ? text.installing : keyChanged ? text.updateAnyway : !trusted ? text.trustAndInstall : isUpdate ? text.update(plugin.version) : text.install;
    return (
      <button
        className="plugin-card__button"
        type="button"
        title={trusted ? undefined : text.trustHint(publisher)}
        disabled={installingId !== null}
        onClick={() => (keyChanged ? setConfirmingKeyChange(true) : onInstall(plugin.id, !trusted, false))}
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
          {plugin.signedBy ? (
            <span className="plugin-market__tag plugin-market__tag--signed" title={text.signedHint(plugin.signedBy)}>
              <KeyRound size={10} strokeWidth={2.4} aria-hidden="true" />
              {text.signed}
            </span>
          ) : null}
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
        {plugin.signingKeyChanged && plugin.installedVersion !== null && !plugin.revoked ? (
          <p className="plugin-card__hint plugin-card__hint--warn">{plugin.signedBy ? text.keyChanged(plugin.signedBy) : text.signatureDropped}</p>
        ) : null}
        {open ? (
          <>
            <p>
              {t.settings.plugins.permissions}:{" "}
              {plugin.permissions.length === 0
                ? t.settings.plugins.noPermissions
                : plugin.permissions.map((name) => (isPermission(name) ? t.settings.plugins.permission[name] : name)).join(locale === "zh-CN" ? "、" : ", ")}
            </p>
            {plugin.runtime ? <p>{plugin.runtime === "node" ? t.settings.plugins.runtimeNode : t.settings.plugins.runtimeBuiltIn}</p> : null}
            {plugin.readme ? (
              <section className="plugin-market__doc" aria-label={text.readme}>
                <Markdown text={plugin.readme} onOpenLink={openLink} />
              </section>
            ) : null}
            {plugin.changelog ? (
              <details className="plugin-market__history">
                <summary>{text.changelog}</summary>
                <Markdown text={plugin.changelog} onOpenLink={openLink} />
              </details>
            ) : null}
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
