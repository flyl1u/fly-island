import { useState } from "react";
import { SettingsRow } from "../../components/settings/SettingsRow";
import { SettingsToggleRow } from "../../components/settings/SettingsToggleRow";
import { SettingsInput } from "../../components/settings/SettingsInput";
import { SettingsSelect } from "../../components/settings/SettingsSelect";
import { SettingsLinkButton } from "../../components/settings/SettingsLinkButton";
import { useLocale, useTranslation } from "../../i18n";
import type { PluginSetting } from "./api";
import { PluginNumberSettingRow } from "./PluginNumberSettingRow";

export function PluginSettingRow({ setting, value, disabled, onSave }: { setting: PluginSetting; value: boolean | string; disabled: boolean; onSave: (value: boolean | string) => void }) {
  const { locale } = useLocale();
  const t = useTranslation().settings.plugins;
  const [draft, setDraft] = useState(setting.type === "secret" ? "" : String(value));
  const title = setting.label[locale];
  if (setting.type === "number") return <PluginNumberSettingRow title={title} value={String(value)} min={setting.min ?? 0} max={setting.max ?? 0} disabled={disabled} onSave={onSave} />;
  if (setting.type === "toggle") return <SettingsToggleRow title={title} checked={value === true} disabled={disabled} onChange={onSave} />;
  if (setting.type === "select") return <SettingsRow title={title} control={<SettingsSelect value={String(value)} options={setting.options.map((o) => ({ value: o.value, label: o.label[locale] }))} ariaLabel={title} disabled={disabled} onChange={onSave} />} />;
  return <SettingsRow title={title} control={<SettingsLinkButton disabled={disabled || (setting.type !== "secret" && draft === String(value))} onClick={() => { onSave(draft); if (setting.type === "secret") setDraft(""); }}>{t.save}</SettingsLinkButton>}>
    <SettingsInput aria-label={title} type={setting.type === "secret" ? "password" : "text"} autoComplete="off" value={draft} disabled={disabled} placeholder={setting.type === "secret" ? t.secret : undefined} onChange={(event) => setDraft(event.target.value)} />
  </SettingsRow>;
}
