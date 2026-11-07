import { ExternalLink, Flag, GitBranch } from "lucide-react";
import { Markdown } from "../../components/markdown/Markdown";
import { useLocale, useTranslation } from "../../i18n";
import { openPluginHomepage, PLUGIN_PERMISSIONS, type MarketPlugin, type PluginPermission } from "./api";
import { repositoryUrl } from "./marketFilter";

const isPermission = (name: string): name is PluginPermission => (PLUGIN_PERMISSIONS as readonly string[]).includes(name);
/** Where problems are reported for plugins whose index entry names no repository. */
const REPORT_URL = "https://github.com/TixXin/fly-island/issues/new";

/** What a market card shows once opened: permissions, runtime, README, version history and links. */
export function MarketPluginDetails({ plugin }: { plugin: MarketPlugin }) {
  const t = useTranslation();
  const text = t.settings.plugins.market;
  const { locale } = useLocale();
  const repo = repositoryUrl(plugin.repo);
  // A plugin's own repository takes its problem reports; the island's repository takes the rest.
  const report = `${repo ? `${repo}/issues/new` : REPORT_URL}?title=${encodeURIComponent(`[plugin] ${plugin.id} ${plugin.version}`)}`;
  const openLink = (href: string) => void openPluginHomepage(href);
  const names = (list: string[]) =>
    list.map((name) => (isPermission(name) ? t.settings.plugins.permission[name] : name)).join(locale === "zh-CN" ? "、" : ", ");

  return (
    <div className="plugin-market__details">
      <p>
        {t.settings.plugins.permissions}: {plugin.permissions.length === 0 ? t.settings.plugins.noPermissions : names(plugin.permissions)}
      </p>
      {plugin.optionalPermissions?.length ? (
        <p>
          {t.settings.plugins.optionalPermission}: {names(plugin.optionalPermissions)}
        </p>
      ) : null}
      {/* "none" runs nothing (a sound pack, say): there is nothing to say about installing it. */}
      {plugin.runtime && plugin.runtime !== "none" ? <p>{plugin.runtime === "node" ? t.settings.plugins.runtimeNode : t.settings.plugins.runtimeBuiltIn}</p> : null}
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
          <button className="plugin-card__button plugin-card__button--quiet" type="button" onClick={() => openLink(repo)}>
            <GitBranch size={12} strokeWidth={2.4} />
            <span>{text.repository}</span>
          </button>
        ) : null}
        {plugin.homepage.startsWith("https://") && plugin.homepage !== repo ? (
          <button className="plugin-card__button plugin-card__button--quiet" type="button" onClick={() => openLink(plugin.homepage)}>
            <ExternalLink size={12} strokeWidth={2.4} />
            <span>{t.settings.plugins.homepage}</span>
          </button>
        ) : null}
        <button className="plugin-card__button plugin-card__button--quiet" type="button" onClick={() => openLink(report)}>
          <Flag size={12} strokeWidth={2.4} />
          <span>{text.reportIssue}</span>
        </button>
      </div>
    </div>
  );
}
