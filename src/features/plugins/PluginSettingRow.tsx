import { useState } from "react";
import { SettingsRow } from "../../components/settings/SettingsRow";
import { SettingsToggleRow } from "../../components/settings/SettingsToggleRow";
import { SettingsInput } from "../../components/settings/SettingsInput";
import { SettingsSelect } from "../../components/settings/SettingsSelect";
import { SettingsLinkButton } from "../../components/settings/SettingsLinkButton";
import { SettingsSecretRow } from "../../components/settings/SettingsSecretRow";
import { useLocale, useTranslation } from "../../i18n";
import type { PluginSetting } from "./api";
import { PluginNumberSettingRow } from "./PluginNumberSettingRow";

export function PluginSettingRow({ setting, value, disabled, onSave }: { setting: PluginSetting; value: boolean | string; disabled: boolean; onSave: (value: boolean | string) => void }) {
  const { locale } = useLocale();
  const t = useTranslation().settings.plugins;
  const [draft, setDraft] = useState(String(value));
  const title = setting.label[locale];
  if (setting.type === "number") return <PluginNumberSettingRow title={title} value={String(value)} min={setting.min ?? 0} max={setting.max ?? 0} disabled={disabled} onSave={onSave} />;
  if (setting.type === "toggle") return <SettingsToggleRow title={title} checked={value === true} disabled={disabled} onChange={onSave} />;
  if (setting.type === "select") return <SettingsRow title={title} control={<SettingsSelect value={String(value)} options={setting.options.map((o) => ({ value: o.value, label: o.label[locale] }))} ariaLabel={title} disabled={disabled} onChange={onSave} />} />;
  if (setting.type === "secret") return <SettingsSecretRow title={title} saveLabel={t.save} placeholder={t.secret} disabled={disabled} onSave={(secret) => onSave(secret)} />;
  return <SettingsRow title={title} control={<SettingsLinkButton disabled={disabled || draft === String(value)} onClick={() => onSave(draft)}>{t.save}</SettingsLinkButton>}>
    <SettingsInput aria-label={title} type="text" autoComplete="off" value={draft} disabled={disabled} onChange={(event) => setDraft(event.target.value)} />
  </SettingsRow>;
}
