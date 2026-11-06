import { SettingsChoice } from "../../components/settings/SettingsChoice";
import { PluginDevSection } from "../../features/plugin-dev/PluginDevSection";
import { PluginIslandPagesSection } from "../../features/plugin-views/PluginIslandPagesSection";
import { PluginMarketSection } from "../../features/plugins/PluginMarketSection";
import { PluginsSettingsSection } from "../../features/plugins/PluginsSettingsSection";
import { useTranslation } from "../../i18n";
import "./PluginsSettingsPage.css";

export type PluginsTab = "installed" | "market";

/**
 * Plugins: what is installed (with the plugins' island pages and, last and folded, the developer
 * tools) and the market, on one page with a switch at the top. Manage on a market card opens
 * that plugin under Installed.
 */
export function PluginsSettingsPage({
  tab,
  managedPluginId,
  onTabChange,
  onManage,
}: {
  tab: PluginsTab;
  /** The plugin Manage was pressed for, opened on the Installed tab. */
  managedPluginId: string | null;
  onTabChange: (tab: PluginsTab) => void;
  onManage: (id: string) => void;
}) {
  const text = useTranslation().settings.plugins;
  const tabs = [
    { value: "installed", label: text.tabs.installed },
    { value: "market", label: text.tabs.market },
  ] as const;

  return (
    <>
      <div className="plugins-page__tabs">
        <SettingsChoice<PluginsTab> value={tab} options={tabs} ariaLabel={text.tabs.label} onChange={onTabChange} />
      </div>
      {tab === "installed" ? (
        <>
          <PluginsSettingsSection key={managedPluginId ?? "list"} initialOpenId={managedPluginId} />
          <PluginIslandPagesSection />
          <PluginDevSection />
        </>
      ) : (
        <PluginMarketSection onManage={onManage} />
      )}
    </>
  );
}
