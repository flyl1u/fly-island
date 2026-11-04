import type { ReactNode } from "react";
import { useTranslation } from "../../i18n";
import { NumberControl } from "../../components/controls/NumberControl";
import { ToggleControl } from "../../components/controls/ToggleControl";
import type { ClipboardHistorySettings } from "./api";
import "./ClipboardSettingsSection.css";

/**
 * The clipboard history options below the module switch (which is `enabled`, set by the
 * page). `children` are further rows from outside this feature, such as the row count.
 * Its shortcut is set on the Shortcuts page.
 */
export function ClipboardSettingsSection({ clipboardSettings, onClipboardSettingsChange, children }: {
  clipboardSettings: ClipboardHistorySettings;
  onClipboardSettingsChange: (settings: ClipboardHistorySettings) => void;
  children?: ReactNode;
}) {
  const t = useTranslation();

  return (
    <section className="settings-section settings-section--clipboard">
      <div className="settings-section__header">
        <span>{t.settings.clipboard.title}</span>
      </div>
      <ToggleControl
        label={t.settings.clipboard.captureImages}
        checked={clipboardSettings.captureImages}
        onChange={(captureImages) =>
          onClipboardSettingsChange({ ...clipboardSettings, captureImages })
        }
      />
      <NumberControl
        label={t.settings.clipboard.maxItems}
        value={clipboardSettings.maxItems}
        min={5}
        max={200}
        onChange={(maxItems) =>
          onClipboardSettingsChange({ ...clipboardSettings, maxItems })
        }
      />
      {children}
    </section>
  );
}
