import { SettingsGroup } from "../../components/settings/SettingsGroup";
import { SettingsNumberRow } from "../../components/settings/SettingsNumberRow";
import { SettingsToggleRow } from "../../components/settings/SettingsToggleRow";
import { useTranslation } from "../../i18n";
import type { ClipboardHistorySettings } from "./api";
import { CLIPBOARD_VISIBLE_ROWS } from "../appearance/settingsLimits";

/**
 * The clipboard history options below the module switch (which is `enabled`, set by the
 * page): what is recorded, then how the list shows. Its shortcut is the next group on the page.
 */
export function ClipboardSettingsSection({
  clipboardSettings, onClipboardSettingsChange, visibleRows, onVisibleRowsChange,
  hoverPreview, onHoverPreviewChange, detached, onDetachedChange, closeOnBlur, onCloseOnBlurChange,
}: {
  clipboardSettings: ClipboardHistorySettings;
  onClipboardSettingsChange: (settings: ClipboardHistorySettings) => void;
  visibleRows: number;
  onVisibleRowsChange: (rows: number) => void;
  hoverPreview: boolean;
  onHoverPreviewChange: (enabled: boolean) => void;
  detached: boolean;
  onDetachedChange: (detached: boolean) => void;
  closeOnBlur: boolean;
  onCloseOnBlurChange: (closeOnBlur: boolean) => void;
}) {
  const t = useTranslation();

  return (
    <>
    <SettingsGroup title={t.settings.clipboard.title}>
      <SettingsToggleRow
        title={t.settings.clipboard.captureImages}
        checked={clipboardSettings.captureImages}
        onChange={(captureImages) => onClipboardSettingsChange({ ...clipboardSettings, captureImages })}
      />
      <SettingsNumberRow
        title={t.settings.clipboard.maxItems}
        value={clipboardSettings.maxItems}
        min={5}
        max={500}
        onChange={(maxItems) => onClipboardSettingsChange({ ...clipboardSettings, maxItems })}
      />
    </SettingsGroup>
    <SettingsGroup title={t.settings.clipboard.displayTitle}>
      <SettingsNumberRow
        title={t.settings.clipboard.visibleRows}
        value={visibleRows}
        min={CLIPBOARD_VISIBLE_ROWS.min}
        max={CLIPBOARD_VISIBLE_ROWS.max}
        onChange={onVisibleRowsChange}
      />
      <SettingsToggleRow title={t.settings.clipboard.hoverPreview} checked={hoverPreview} onChange={onHoverPreviewChange} />
      <SettingsToggleRow title={t.settings.clipboard.detached} checked={detached} onChange={onDetachedChange} />
      {detached && (
        <SettingsToggleRow indent title={t.settings.clipboard.closeOnBlur} description={t.settings.clipboard.closeOnBlurHint}
          checked={closeOnBlur} onChange={onCloseOnBlurChange} />
      )}
    </SettingsGroup>
    </>
  );
}
