import { SettingsGroup } from "../../components/settings/SettingsGroup";
import { SettingsToggleRow } from "../../components/settings/SettingsToggleRow";
import { PluginIcon } from "../../features/plugins/PluginIcon";
import type { NativePluginId } from "../../features/plugins/native/catalog";
import { OFFICE_SOURCES } from "../../features/messages/messagePreview";
import { useOfficeImEnabled, useOfficeImSnapshot } from "../../features/messages/office-im/useOfficeIm";
import { useTranslation } from "../../i18n";

/** One installed work-message plugin's group on the Messages page: its receive switch. */
export function OfficeImSettingsGroup({ id }: { id: NativePluginId }) {
  const t = useTranslation();
  const [enabled, setEnabled] = useOfficeImEnabled();
  const snapshot = useOfficeImSnapshot();
  const source = OFFICE_SOURCES.find((item) => item === id);
  if (!source) return null;
  // As the WeChat group does: a listener that cannot start says why here, not only on its page.
  const error = enabled[source] ? snapshot[source].error : null;
  const footer = error
    ? <span className="messages-settings__error" role="alert">{error}</span>
    : t.settings.plugins.market.officeHint(t.messages.sourceLabels[source]);
  return <SettingsGroup anchor={source} icon={<PluginIcon id={source} size={16} />}
    title={t.settings.plugins.market.items[source].name} footer={footer}>
    <SettingsToggleRow title={t.messages.office.receive(t.messages.sourceLabels[source])}
      checked={enabled[source]} onChange={(on) => setEnabled(source, on)} />
  </SettingsGroup>;
}
