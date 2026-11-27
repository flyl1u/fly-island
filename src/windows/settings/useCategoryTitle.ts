import { standalonePages } from "../../features/plugins/placement.ts";
import { usePlacedPlugins, usePluginName } from "../../features/plugins/usePlacedPlugins";
import { useTranslation } from "../../i18n";
import type { SettingsCategory } from "./categories";

/** A page's name in the sidebar and above the page; a plugin's own page goes by the plugin's name. */
export function useCategoryTitle() {
  const text: object = useTranslation().settings.categories;
  const placed = usePlacedPlugins();
  const name = usePluginName();
  return (category: SettingsCategory) => {
    const plugin = standalonePages(placed).find((entry) => entry.category === category);
    if (plugin) return name(plugin);
    const label = (text as Record<string, unknown>)[category];
    return typeof label === "string" ? label : "";
  };
}
