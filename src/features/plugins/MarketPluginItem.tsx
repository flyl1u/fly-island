import { useState } from "react";
import { BadgeCheck, KeyRound, Lock } from "lucide-react";
import { useLocale, useTranslation } from "../../i18n";
import { MARKET_CATEGORIES, marketPublisher, type MarketCategory, type MarketPlugin, type MarketSnapshot } from "./api";
import { MarketPluginAction } from "./MarketPluginAction";
import { MarketPluginDetails } from "./MarketPluginDetails";
import { pluginIconTone, pluginInitial } from "./marketGroups";
import { NodeMissingHint } from "./NodeMissingHint";
import { isSensitivePermission } from "./promptedPermissions";

const isCategory = (name: string): name is MarketCategory => (MARKET_CATEGORIES as readonly string[]).includes(name);

/**
 * One plugin on the market page: a generated icon, its name with an Official or
 * Verified mark, one line of facts (publisher, permissions, runtime, tags), a
 * two-line description, and Install / Installed + Manage / Update on the right.
 * Clicking the card opens its details.
 */
export function MarketPluginItem({
  plugin,
  market,
  installingId,
  onInstall,
  onManage,
}: {
  plugin: MarketPlugin;
  market: MarketSnapshot;
  installingId: string | null;
  /** `trust`: the user agreed to trust the publisher first. `acceptKeyChange`: the user confirmed a new author key. */
  onInstall: (id: string, trust: boolean, acceptKeyChange: boolean) => void;
  onManage?: (id: string) => void;
}) {
  const t = useTranslation();
  const text = t.settings.plugins.market;
  const { locale } = useLocale();
  const [open, setOpen] = useState(false);
  const publisher = marketPublisher(plugin, market);
  const official = publisher === market.officialPublisher;
  const trusted = official || market.trustedPublishers.includes(publisher);
  const permissions = [...plugin.permissions, ...(plugin.optionalPermissions ?? [])];
  const sensitive = permissions.some(isSensitivePermission);
  const runtime = plugin.runtime === "node" || plugin.runtime === "powershell" || plugin.runtime === "exe" ? text.runtime[plugin.runtime] : null;

  return (
    <article className={`plugin-market__item${open ? " plugin-market__item--open" : ""}`}>
      <span className={`plugin-market__icon plugin-market__icon--${pluginIconTone(plugin)}`} aria-hidden="true">
        {pluginInitial(plugin.name[locale])}
      </span>
      <button className="plugin-market__summary" type="button" aria-expanded={open} onClick={() => setOpen(!open)}>
        <span className="plugin-market__title">
          <strong>{plugin.name[locale]}</strong>
          {official ? (
            <span className="plugin-market__badge plugin-market__badge--official">
              <BadgeCheck size={11} strokeWidth={2.4} aria-hidden="true" />
              {text.official}
            </span>
          ) : plugin.verified ? (
            <span className="plugin-market__badge">
              <BadgeCheck size={11} strokeWidth={2.4} aria-hidden="true" />
              {text.verified}
            </span>
          ) : null}
          <span className="plugin-market__version">v{plugin.version}</span>
        </span>
        <span className="plugin-market__meta">
          {official ? null : <span>{text.publisher(publisher)}</span>}
          <span className={`plugin-market__permissions${sensitive ? " plugin-market__permissions--sensitive" : ""}`}>
            <Lock size={10} strokeWidth={2.4} aria-hidden="true" />
            {permissions.length > 0 ? t.settings.plugins.permissionCount(permissions.length) : text.noPermissions}
          </span>
          {runtime ? <span>{runtime}</span> : null}
          {plugin.signedBy ? (
            <span className="plugin-market__tag plugin-market__tag--signed">
              <KeyRound size={10} strokeWidth={2.4} aria-hidden="true" />
              {text.signed}
            </span>
          ) : null}
          {plugin.webview ? (
            <span className="plugin-market__tag plugin-market__tag--custom">
              {text.customUi}
            </span>
          ) : null}
          {plugin.categories.filter(isCategory).map((category) => (
            <span key={category} className="plugin-market__tag">
              {text.category[category]}
            </span>
          ))}
        </span>
        {plugin.description?.[locale] ? <span className={open ? "plugin-market__description" : "plugin-market__description plugin-market__clamp"}>{plugin.description[locale]}</span> : null}
      </button>
      <div className="plugin-market__action">
        <MarketPluginAction plugin={plugin} trusted={trusted} installingId={installingId} onInstall={onInstall} onManage={onManage} />
      </div>
      <div className="plugin-market__notes">
        {plugin.revoked ? <p className="plugin-card__error">{plugin.revoked[locale]}</p> : null}
        {!trusted && !plugin.revoked ? <p className="plugin-card__hint">{text.trustHint(publisher)}</p> : null}
        {plugin.signingKeyChanged && plugin.installedVersion !== null && !plugin.revoked ? (
          <p className="plugin-card__hint plugin-card__hint--warn">{plugin.signedBy ? text.keyChanged(plugin.signedBy) : text.signatureDropped}</p>
        ) : null}
        {plugin.runtime === "node" && !market.nodeAvailable ? <NodeMissingHint /> : null}
        {open ? <MarketPluginDetails plugin={plugin} /> : null}
      </div>
    </article>
  );
}
