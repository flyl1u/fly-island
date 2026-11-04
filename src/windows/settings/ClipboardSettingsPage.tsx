import { ClipboardSettingsSection } from "../../features/clipboard/ClipboardSettingsSection";
import { useClipboardSettings } from "../../features/clipboard/useClipboardSettings";
import { NumberControl } from "../../components/controls/NumberControl";
import { MAX_CLIPBOARD_VISIBLE_ROWS, MIN_CLIPBOARD_VISIBLE_ROWS } from "../../features/appearance/settings";
import type { IslandSettings } from "../../features/appearance/types";
import { useTranslation } from "../../i18n";

function noop() {}

export function ClipboardSettingsPage({
  settings,
  onSettingsChange,
}: {
  settings: IslandSettings;
  onSettingsChange: (settings: IslandSettings) => void;
}) {
  const t = useTranslation();
  const [clipboardSettings, updateClipboardSettings] = useClipboardSettings();

  return (
    <>
      <ClipboardSettingsSection
        clipboardSettings={clipboardSettings}
        focusClipboardShortcutToken={0}
        onClipboardSettingsChange={updateClipboardSettings}
        onClipboardShortcutFocusHandled={noop}
      />
      <section className="settings-section settings-section--clipboard-panel">
        <div className="settings-section__header">
          <span>{t.settings.clipboard.panelTitle}</span>
        </div>
        <NumberControl
          label={t.settings.clipboard.visibleRows}
          value={settings.clipboardVisibleRows}
          min={MIN_CLIPBOARD_VISIBLE_ROWS}
          max={MAX_CLIPBOARD_VISIBLE_ROWS}
          onChange={(clipboardVisibleRows) => onSettingsChange({ ...settings, clipboardVisibleRows })}
        />
      </section>
    </>
  );
}
