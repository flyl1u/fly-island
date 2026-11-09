import { SettingsGroup } from "../../components/settings/SettingsGroup";
import { useTranslation } from "../../i18n";
import { UpdatePanel } from "./UpdatePanel";

/** Settings → About → Version: check and install, and the channel. */
export function UpdateSettingsSection() {
  const t = useTranslation();

  return (
    <SettingsGroup title={t.settings.project.versionTitle}>
      <div className="about-update">
        <UpdatePanel />
      </div>
    </SettingsGroup>
  );
}
