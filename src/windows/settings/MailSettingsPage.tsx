import type { IslandSettings } from "../../features/appearance/types";
import { useTranslation } from "../../i18n";
import { ModuleSwitchSection } from "./ModuleSwitchSection";

/** Mail: the module switch. The mailboxes themselves are set up in the island's mail panel. */
export function MailSettingsPage({
  settings,
  onSettingsChange,
}: {
  settings: IslandSettings;
  onSettingsChange: (settings: IslandSettings) => void;
}) {
  const t = useTranslation();

  return (
    <ModuleSwitchSection
      label={t.settings.modules.mail}
      checked={settings.mailEnabled}
      onChange={(mailEnabled) => onSettingsChange({ ...settings, mailEnabled })}
    />
  );
}
