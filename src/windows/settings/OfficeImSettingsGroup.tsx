import { SettingsGroup } from "../../components/settings/SettingsGroup";
import { SettingsToggleRow } from "../../components/settings/SettingsToggleRow";
import { NativePluginIcon, useNativePlugins } from "../../features/plugins";
import { OFFICE_SOURCES } from "../../features/messages/messagePreview";
import { useOfficeImEnabled } from "../../features/messages/office-im/useOfficeIm";
import { useTranslation } from "../../i18n";

/** DingTalk / Feishu / WeCom switches, one row per client installed from the plugin market. */
export function OfficeImSettingsGroup() {
  const t = useTranslation();
  const installed = useNativePlugins();
  const [enabled, setEnabled] = useOfficeImEnabled();
  const sources = OFFICE_SOURCES.filter((source) => installed[source]);
  if (sources.length === 0) return null;
  return <SettingsGroup title={t.settings.plugins.market.officeTitle} footer={t.settings.plugins.market.officeHint}>
    {sources.map((source) => <SettingsToggleRow key={source}
      title={<span className="messages-settings__office-title"><NativePluginIcon id={source} size={16} />{t.messages.office.receive(t.messages.sourceLabels[source])}</span>}
      checked={enabled[source]} onChange={(on) => setEnabled(source, on)} />)}
  </SettingsGroup>;
}
