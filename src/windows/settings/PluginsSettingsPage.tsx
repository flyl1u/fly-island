import { PluginDevSection } from "../../features/plugin-dev/PluginDevSection";
import { PluginIslandPagesSection } from "../../features/plugin-views/PluginIslandPagesSection";
import { PluginsSettingsSection } from "../../features/plugins/PluginsSettingsSection";

/**
 * Plugins: what is installed, the plugins' island pages and, last and folded, the developer
 * tools. The market has its own page; Manage there opens that plugin here.
 */
export function PluginsSettingsPage({
  managedPluginId,
}: {
  /** The plugin Manage was pressed for in the market, opened at once. */
  managedPluginId: string | null;
}) {
  return (
    <>
      <PluginsSettingsSection key={managedPluginId ?? "list"} initialOpenId={managedPluginId} />
      <PluginIslandPagesSection />
      <PluginDevSection />
    </>
  );
}
