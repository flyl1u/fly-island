import { ApiBalancePanel } from "../../features/api-balance/ApiBalancePanel";
import type { IslandSettings } from "../../features/appearance/types";

export function PluginsSettingsPage({ settings, onSettingsChange }: {
  settings: IslandSettings;
  onSettingsChange: (settings: IslandSettings) => void;
}) {
  return <ApiBalancePanel showCollapsed={settings.balanceShowCollapsed}
    onShowCollapsedChange={balanceShowCollapsed => onSettingsChange({ ...settings, balanceShowCollapsed })} />;
}
