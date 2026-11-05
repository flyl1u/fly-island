import { useSyncExternalStore } from "react";
import { ToggleControl } from "../../components/controls/ToggleControl";
import { useLocale, useTranslation } from "../../i18n";
import { getUpdateState, setAutoCheck, subscribeToUpdate } from "./updaterController";
import { UpdatePanel } from "./UpdatePanel";

/** Settings → Updates: check and install, the channel, and the background check. */
export function UpdateSettingsSection() {
  const t = useTranslation();
  const { locale } = useLocale();
  const text = t.settings.project.update;
  const { stage, autoCheck, lastCheckedAt } = useSyncExternalStore(subscribeToUpdate, getUpdateState);
  const lastChecked = lastCheckedAt === null
    ? text.neverChecked
    : text.lastChecked(new Date(lastCheckedAt).toLocaleString(locale, { dateStyle: "medium", timeStyle: "short" }));

  return (
    <>
      <section className="settings-section settings-section--about-version">
        <div className="settings-section__header">
          <span>{t.settings.project.versionTitle}</span>
        </div>
        <UpdatePanel />
      </section>
      {stage !== "disabled" && (
        <section className="settings-section settings-section--update-auto">
          <div className="settings-section__header">
            <span>{text.autoTitle}</span>
          </div>
          <ToggleControl label={text.autoCheck} checked={autoCheck} onChange={setAutoCheck} />
          <p className="settings-section__hint">{text.autoCheckHint}</p>
          <p className="settings-section__hint">{lastChecked}</p>
        </section>
      )}
    </>
  );
}
