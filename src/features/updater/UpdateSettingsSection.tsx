import { useSyncExternalStore } from "react";
import { SettingsGroup } from "../../components/settings/SettingsGroup";
import { SettingsToggleRow } from "../../components/settings/SettingsToggleRow";
import { useLocale, useTranslation } from "../../i18n";
import { getUpdateState, setAutoCheck, subscribeToUpdate } from "./updaterController";
import { UpdatePanel } from "./UpdatePanel";

/** Settings → About → Version: check and install, the channel, and the background check. */
export function UpdateSettingsSection() {
  const t = useTranslation();
  const { locale } = useLocale();
  const text = t.settings.project.update;
  const { stage, autoCheck, lastCheckedAt } = useSyncExternalStore(subscribeToUpdate, getUpdateState);
  const lastChecked = lastCheckedAt === null
    ? text.neverChecked
    : text.lastChecked(new Date(lastCheckedAt).toLocaleString(locale, { dateStyle: "medium", timeStyle: "short" }));

  return (
    <SettingsGroup title={t.settings.project.versionTitle} footer={stage === "disabled" ? undefined : lastChecked}>
      <div className="about-update">
        <UpdatePanel />
      </div>
      {stage !== "disabled" && (
        <SettingsToggleRow title={text.autoCheck} description={text.autoCheckHint} checked={autoCheck} onChange={setAutoCheck} />
      )}
    </SettingsGroup>
  );
}
