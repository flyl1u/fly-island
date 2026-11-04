import { useCallback, useEffect, useState } from "react";
import { ArrowDown, ArrowUp } from "lucide-react";
import { ToggleControl } from "../../components/controls/ToggleControl";
import { useLocale, useTranslation } from "../../i18n";
import { listPluginViews, type PluginViewEntry } from "./api";
import { viewIcon } from "./icons";
import { pluginPageId } from "./model";
import { movePluginPage, orderPluginViews, setPluginPageHidden } from "./pagePrefs";
import { usePluginPagePrefs } from "./usePluginPagePrefs";
import "./PluginIslandPagesSection.css";

/** Settings → plugins: which plugin pages the island shows, and their order (also their Alt+number). */
export function PluginIslandPagesSection() {
  const t = useTranslation();
  const { locale } = useLocale();
  const labels = t.pluginViews.pagesSettings;
  const [views, setViews] = useState<PluginViewEntry[]>([]);
  const [prefs, setPrefs] = usePluginPagePrefs();

  // Plugin events go to the island window only, so look again when this window gets focus.
  const refresh = useCallback(() => {
    listPluginViews()
      .then((snapshot) => setViews(snapshot.views))
      .catch((error: unknown) => console.error("Failed to list plugin pages", error));
  }, []);
  useEffect(() => {
    refresh();
    window.addEventListener("focus", refresh);
    return () => window.removeEventListener("focus", refresh);
  }, [refresh]);

  const ordered = orderPluginViews(views, prefs);

  return (
    <section className="settings-section plugins-panel">
      <div className="settings-section__header">
        <span>{labels.title}</span>
      </div>
      <p className="settings-section__hint">{labels.hint}</p>
      {ordered.length === 0 ? <p className="settings-section__hint">{labels.empty}</p> : null}
      <ul className="plugin-pages">
        {ordered.map((view, index) => {
          const id = pluginPageId(view.pluginId, view.viewId);
          const Icon = viewIcon(view.icon);
          const title = view.title[locale];
          return (
            <li className="plugin-pages__row" key={id}>
              <Icon size={14} strokeWidth={2.3} aria-hidden="true" />
              <span className="plugin-pages__name" title={`${title} · ${view.pluginName[locale]}`}>
                <strong>{title}</strong>
                <small>{view.pluginName[locale]}</small>
              </span>
              <button className="plugin-card__button" type="button" disabled={index === 0} title={labels.moveUp} aria-label={`${labels.moveUp}: ${title}`} onClick={() => setPrefs(movePluginPage(views, prefs, id, -1))}>
                <ArrowUp size={12} strokeWidth={2.4} />
              </button>
              <button className="plugin-card__button" type="button" disabled={index === ordered.length - 1} title={labels.moveDown} aria-label={`${labels.moveDown}: ${title}`} onClick={() => setPrefs(movePluginPage(views, prefs, id, 1))}>
                <ArrowDown size={12} strokeWidth={2.4} />
              </button>
              <ToggleControl label={labels.show} checked={!prefs.hidden.includes(id)} onChange={(show) => setPrefs(setPluginPageHidden(prefs, id, !show))} />
            </li>
          );
        })}
      </ul>
    </section>
  );
}
