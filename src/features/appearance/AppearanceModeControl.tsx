import { useTranslation } from "../../i18n";
import { getEffectiveAppearanceMode, LIQUID_GLASS_ENABLED } from "./settings";
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
  const effectiveMode = getEffectiveAppearanceMode(value);
  return (
    <div className="appearance-mode-control">
      <span>{t.settings.appearance.title}</span>
      <div className="appearance-mode-control__segments" role="group">
        <button
          className={effectiveMode === "classic" ? "appearance-mode-control--active" : ""}
          type="button"
          aria-pressed={effectiveMode === "classic"}
          onClick={() => onChange("classic")}
        >
          {t.settings.appearance.classic}
        </button>
        <button
          className={
            effectiveMode === "liquidGlass" ? "appearance-mode-control--active" : ""
          }
          type="button"
          aria-pressed={effectiveMode === "liquidGlass"}
          disabled={!LIQUID_GLASS_ENABLED}
          title={LIQUID_GLASS_ENABLED ? undefined : t.settings.appearance.liquidGlassUnavailable}
          aria-label={LIQUID_GLASS_ENABLED ? undefined : t.settings.appearance.liquidGlassUnavailable}
          onClick={() => onChange("liquidGlass")}
        >
          {t.settings.appearance.liquidGlass}
        </button>
      </div>
    </div>
  );
}
