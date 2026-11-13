import { Puzzle } from "lucide-react";
import { useTranslation } from "../../i18n";
import "./PluginsSettingsPage.css";

export function PluginsSettingsPage() {
  const t = useTranslation();
  return (
    <section className="settings-section settings-section--list plugins-settings">
      <Puzzle size={32} strokeWidth={1.5} absoluteStrokeWidth aria-hidden="true" />
      <p className="plugins-settings__empty">{t.settings.plugins.empty}</p>
    </section>
  );
}
