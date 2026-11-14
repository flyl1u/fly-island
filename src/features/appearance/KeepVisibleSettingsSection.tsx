import { useTranslation } from "../../i18n";
import { SettingsGroup } from "../../components/settings/SettingsGroup";
import { SettingsToggleRow } from "../../components/settings/SettingsToggleRow";
import type { IslandSettings } from "./types";

export function KeepVisibleSettingsSection({ settings, onSettingsChange }: {
  settings: IslandSettings;
  onSettingsChange: (settings: IslandSettings) => void;
}) {
  const text = useTranslation().settings.keepVisible;
  if (!settings.autoTuck) return null;
  const fields = ["keepVisibleWhileAgentRunning", "keepVisibleWhileLyrics", "keepVisibleWhileTodoRunning"] as const;
  return (
    <SettingsGroup title={text.title} footer={text.hint}>
      {fields.map((field) => <SettingsToggleRow key={field} title={text[field]} checked={settings[field]}
        onChange={(value) => onSettingsChange({ ...settings, [field]: value })} />)}
    </SettingsGroup>
  );
}
