import { useId, useState } from "react";
import { SettingsGroup } from "../../components/settings/SettingsGroup";
import { SettingsLinkButton } from "../../components/settings/SettingsLinkButton";
import { SettingsNumberRow } from "../../components/settings/SettingsNumberRow";
import { SettingsRow } from "../../components/settings/SettingsRow";
import { useTranslation } from "../../i18n";
import { WATER_INTERVAL, WATER_MESSAGE_COUNT, WATER_MESSAGE_LIMIT } from "./storage";
import { updateWaterSettings, useWaterSettings } from "./useWaterSettings";
import "./WaterReminderSettingsPage.css";

export function WaterReminderSettingsPage() {
  const messagesId = useId();
  const { waterReminder: t, save } = useTranslation().settings.plugins;
  const { intervalMinutes, messages } = useWaterSettings();
  const [draft, setDraft] = useState<string | null>(null);
  const [status, setStatus] = useState<"saved" | "error" | null>(null);
  const text = draft ?? (messages.length ? messages : t.defaults).join("\n");

  function saveMessages() {
    if (!updateWaterSettings({ messages: text.split(/\r?\n/) })) {
      setStatus("error");
      return;
    }
    setStatus("saved");
    setDraft(null);
  }

  return <SettingsGroup footer={status && <span role={status === "error" ? "alert" : "status"}>
    {status === "error" ? t.saveFailed : t.saved}
  </span>}>
    <SettingsNumberRow title={t.interval} description={t.duration} value={intervalMinutes}
      min={WATER_INTERVAL.min} max={WATER_INTERVAL.max} unit={t.minutes}
      onChange={(minutes) => setStatus(updateWaterSettings({ intervalMinutes: minutes }) ? null : "error")} />
    <SettingsRow title={t.messages} labelFor={messagesId} description={t.messagesHint(WATER_MESSAGE_COUNT, WATER_MESSAGE_LIMIT)}
      control={<SettingsLinkButton disabled={draft === null} onClick={saveMessages}>{save}</SettingsLinkButton>}>
      <textarea id={messagesId} className="settings-input water-reminder-settings__messages" rows={5}
        value={text} onChange={(event) => { setDraft(event.target.value); setStatus(null); }} />
    </SettingsRow>
  </SettingsGroup>;
}
