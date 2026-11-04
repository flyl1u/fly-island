import type { PluginViewEntry } from "../../features/plugin-views/api";
import { viewIcon } from "../../features/plugin-views/icons";
import { pluginPageId } from "../../features/plugin-views/model";
import { useLocale, useTranslation } from "../../i18n";
import { pageShortcutLabel, type IslandFeatures } from "./features";
import type { IslandPage } from "./types";
import "./PluginPageButtons.css";

/** One small icon button per plugin page, after the built-in page dots. */
export function PluginPageButtons({
  views,
  page,
  features,
  modifiers,
  onOpen,
}: {
  views: readonly PluginViewEntry[];
  page: IslandPage;
  features: IslandFeatures;
  modifiers: string;
  onOpen: (page: IslandPage) => void;
}) {
  const t = useTranslation();
  const { locale } = useLocale();
  return (
    <>
      {views.map((view) => {
        const id = pluginPageId(view.pluginId, view.viewId);
        const Icon = viewIcon(view.icon);
        const label = t.pluginViews.pageLabel(view.title[locale], view.pluginName[locale]);
        const shortcut = pageShortcutLabel(features, id, modifiers);
        const title = shortcut ? `${label} (${shortcut})` : label;
        return (
          <button
            className={`plugin-page-button${page === id ? " plugin-page-button--active" : ""}`}
            type="button"
            key={id}
            data-plugin-page={id}
            title={title}
            aria-label={title}
            aria-pressed={page === id}
            onClick={(event) => {
              event.stopPropagation();
              onOpen(id);
            }}
          >
            <Icon size={13} strokeWidth={2.3} aria-hidden="true" />
          </button>
        );
      })}
    </>
  );
}
