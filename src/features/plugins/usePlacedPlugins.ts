import { useMemo } from "react";
import { useLocale, useTranslation } from "../../i18n";
import { useNativePlugins } from "./native";
import { placedPlugins, type PlacedPlugin } from "./placement.ts";
import { usePlugins } from "./usePlugins";

/** The installed, switched-on plugins and the settings pages they declared. */
export function usePlacedPlugins() {
  const native = useNativePlugins();
  const { registry } = usePlugins();
  return useMemo(() => placedPlugins(native, registry.installed), [native, registry.installed]);
}

/** The name a plugin goes by on its card, sidebar entry and group title. */
export function usePluginName() {
  const market: Readonly<Record<string, { name: string } | undefined>> = useTranslation().settings.plugins.market.items;
  const { locale } = useLocale();
  return (plugin: PlacedPlugin) => market[plugin.id]?.name ?? plugin.external?.manifest.name[locale] ?? plugin.id;
}
