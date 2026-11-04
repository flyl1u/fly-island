import { useTranslation } from "../../i18n";
import type { AppearanceMode } from "./types";
import "./AppearanceModeControl.css";

export function AppearanceModeControl({
  value,
  onChange,
}: {
  value: AppearanceMode;
  onChange: (value: AppearanceMode) => void;
}) {
  const t = useTranslation();
  return (
    <div className="appearance-mode-control">
      <span>{t.settings.appearance.title}</span>
      <div className="appearance-mode-control__segments" role="group">
        <button
          className={value === "classic" ? "appearance-mode-control--active" : ""}
          type="button"
          aria-pressed={value === "classic"}
          onClick={() => onChange("classic")}
        >
          {t.settings.appearance.classic}
        </button>
        <button
          className={
            value === "liquidGlass" ? "appearance-mode-control--active" : ""
          }
          type="button"
          aria-pressed={value === "liquidGlass"}
          onClick={() => onChange("liquidGlass")}
        >
          {t.settings.appearance.liquidGlass}
        </button>
      </div>
    </div>
  );
}
