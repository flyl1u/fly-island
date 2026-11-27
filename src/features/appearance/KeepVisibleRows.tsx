import { useTranslation } from "../../i18n";
import { SettingsToggleRow } from "../../components/settings/SettingsToggleRow";
import type { IslandSettings } from "./types";

/** Under "Tuck when idle": the times the island stays out anyway. Only while auto-tuck is on. */
export function KeepVisibleRows({ settings, onSettingsChange }: {
  settings: IslandSettings;
  onSettingsChange: (settings: IslandSettings) => void;
}) {
  const text = useTranslation().settings.keepVisible;
  if (!settings.autoTuck) return null;
  const fields = ["keepVisibleWhileAgentRunning", "keepVisibleWhileLyrics", "keepVisibleWhileTodoRunning"] as const;
  return fields.map((field) => <SettingsToggleRow key={field} indent title={text[field]} checked={settings[field]}
    disabled={settings.neverAutoTuck} onChange={(value) => onSettingsChange({ ...settings, [field]: value })} />);
}
