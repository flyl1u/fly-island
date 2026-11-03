import { useCallback, useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { Keyboard } from "lucide-react";
import { useTranslation } from "../../i18n";
import { NumberControl } from "../../components/controls/NumberControl";
import { ToggleControl } from "../../components/controls/ToggleControl";
import type { ClipboardHistorySettings } from "./api";
import { buildShortcutFromEvent, normalizeClipboardShortcut } from "./shortcut";

export function ClipboardSettingsSection({ clipboardSettings, focusClipboardShortcutToken, onClipboardSettingsChange, onClipboardShortcutFocusHandled }: {
  clipboardSettings: ClipboardHistorySettings;
  focusClipboardShortcutToken: number;
  onClipboardSettingsChange: (settings: ClipboardHistorySettings) => void;
  onClipboardShortcutFocusHandled: () => void;
}) {
  const t = useTranslation();
  const clipboardShortcutPanelRef = useRef<HTMLElement | null>(null);
  const clipboardShortcutButtonRef = useRef<HTMLButtonElement | null>(null);
  const [isRecordingShortcut, setIsRecordingShortcut] = useState(false);

  useEffect(() => {
    if (focusClipboardShortcutToken <= 0) {
      return;
    }

    const frame = window.requestAnimationFrame(() => {
      const editorPanel = clipboardShortcutPanelRef.current?.closest(".editor-panel");

      if (editorPanel instanceof HTMLElement && clipboardShortcutPanelRef.current) {
        const targetTop = clipboardShortcutPanelRef.current.offsetTop - 12;
        editorPanel.scrollTo({ top: targetTop, behavior: "smooth" });
      }

      clipboardShortcutButtonRef.current?.focus({ preventScroll: true });
      setIsRecordingShortcut(true);
      onClipboardShortcutFocusHandled();
    });

    return () => window.cancelAnimationFrame(frame);
  }, [focusClipboardShortcutToken, onClipboardShortcutFocusHandled]);

  const handleShortcutKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLButtonElement>) => {
      if (!isRecordingShortcut) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();

      if (event.key === "Escape") {
        setIsRecordingShortcut(false);
        return;
      }

      const shortcut = buildShortcutFromEvent(event.nativeEvent);

      if (!shortcut) {
        return;
      }

      onClipboardSettingsChange({
        ...clipboardSettings,
        shortcut,
      });
      setIsRecordingShortcut(false);
    },
    [clipboardSettings, isRecordingShortcut, onClipboardSettingsChange],
  );

  return (
    <section
      className={[
        "settings-section",
        "settings-section--clipboard",
        focusClipboardShortcutToken > 0 ? "settings-section--attention" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      ref={clipboardShortcutPanelRef}
    >
      <div className="settings-section__header">
        <span>{t.settings.clipboard.title}</span>
      </div>
      <ToggleControl
        label={t.settings.clipboard.enabled}
        checked={clipboardSettings.enabled}
        onChange={(enabled) =>
          onClipboardSettingsChange({ ...clipboardSettings, enabled })
        }
      />
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
      <ToggleControl
        label={t.settings.clipboard.shortcutEnabled}
        checked={clipboardSettings.shortcutEnabled}
        onChange={(shortcutEnabled) =>
          onClipboardSettingsChange({ ...clipboardSettings, shortcutEnabled })
        }
      />
      <div
        className={[
          "shortcut-control",
          clipboardSettings.shortcutEnabled ? "" : "shortcut-control--disabled",
        ]
          .filter(Boolean)
          .join(" ")}
      >
        <div className="shortcut-control__meta">
          <span>{t.settings.clipboard.shortcut}</span>
          <strong>{normalizeClipboardShortcut(clipboardSettings.shortcut)}</strong>
        </div>
        <button
          ref={clipboardShortcutButtonRef}
          className={[
            "shortcut-record-button",
            isRecordingShortcut ? "shortcut-record-button--recording" : "",
          ]
            .filter(Boolean)
            .join(" ")}
          type="button"
          disabled={!clipboardSettings.shortcutEnabled}
          onClick={() => setIsRecordingShortcut(true)}
          onKeyDown={handleShortcutKeyDown}
          onBlur={() => setIsRecordingShortcut(false)}
        >
          <Keyboard size={14} strokeWidth={2.3} />
          <span>
            {isRecordingShortcut
              ? t.settings.clipboard.pressKeys
              : normalizeClipboardShortcut(clipboardSettings.shortcut)}
          </span>
        </button>
      </div>
    </section>
  );
}
