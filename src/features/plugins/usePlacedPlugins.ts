import { useMemo } from "react";
import { useLocale, useTranslation } from "../../i18n";
import { useNativePluginStates } from "./native";
import { useScreenshotSettings } from "../screenshot/useScreenshotSettings";
import { placedPlugins, type PlacedPlugin } from "./placement.ts";
import { usePlugins } from "./usePlugins";

/** The installed, switched-on plugins and the settings pages they declared. */
export function usePlacedPlugins() {
  const { installed, enabled: native } = useNativePluginStates();
  const { shortcutIssue } = useScreenshotSettings();
  const { registry } = usePlugins();
  return useMemo(() => {
    const placed = placedPlugins(native, registry.installed);
    // An OS hotkey conflict disables capture, but must leave a route to its repair controls.
    if (installed.screenshot && !native.screenshot && shortcutIssue) placed.push({
      id: "screenshot", native: "screenshot", category: "screenshot", actionsCategory: "screenshot", standalone: true,
    });
    return placed;
  }, [installed.screenshot, native, registry.installed, shortcutIssue]);
}

/** The name a plugin goes by on its card, sidebar entry and group title. */
export function usePluginName() {
  const market: Readonly<Record<string, { name: string } | undefined>> = useTranslation().settings.plugins.market.items;
  const { locale } = useLocale();
  return (plugin: PlacedPlugin) => market[plugin.id]?.name ?? plugin.external?.manifest.name[locale] ?? plugin.id;
}
