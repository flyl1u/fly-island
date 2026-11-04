import { useTranslation } from "../../i18n";
import { ToggleControl } from "../../components/controls/ToggleControl";
import type { IslandSettings, MinimizeAction } from "./types";
import "./AppearanceModeControl.css";

export function DisplaySettingsSection({
  settings,
  onSettingsChange,
}: {
  settings: IslandSettings;
  onSettingsChange: (settings: IslandSettings) => void;
}) {
  const t = useTranslation();
  const minimizeActions: [MinimizeAction, string][] = [
    ["tray", t.settings.layout.minimizeToTray],
    ["tuck", t.settings.layout.minimizeToTop],
  ];

  return (
    <section className="settings-section settings-section--display">
      <div className="settings-section__header">
        <span>{t.settings.layout.displayTitle}</span>
      </div>
      <ToggleControl
        label={t.settings.layout.showCollapsedText}
        checked={settings.showCollapsedText}
        onChange={(showCollapsedText) =>
          onSettingsChange({ ...settings, showCollapsedText })
        }
      />
      <ToggleControl
        label={t.settings.layout.showIdleTodoCount}
        checked={settings.showIdleTodoCount}
        onChange={(showIdleTodoCount) =>
          onSettingsChange({ ...settings, showIdleTodoCount })
        }
      />
      <ToggleControl
        label={t.settings.layout.showTitle}
        checked={settings.showTitle}
        onChange={(showTitle) => onSettingsChange({ ...settings, showTitle })}
      />
      <div className="appearance-mode-control">
        <span>{t.settings.layout.minimizeAction}</span>
        <div className="appearance-mode-control__segments" role="group" aria-label={t.settings.layout.minimizeAction}>
          {minimizeActions.map(([minimizeAction, label]) => (
            <button
              key={minimizeAction}
              className={settings.minimizeAction === minimizeAction ? "appearance-mode-control--active" : ""}
              type="button"
              aria-pressed={settings.minimizeAction === minimizeAction}
              onClick={() => onSettingsChange({ ...settings, minimizeAction })}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}
