import { Sun, Volume1, Volume2, VolumeX } from "lucide-react";
import type { CSSProperties } from "react";
import { useTranslation } from "../../i18n";
import type { LevelChange } from "./api";
import "./LevelPopup.css";

/** The collapsed island's volume or brightness line: an icon, a bar and the percentage. */
export function LevelPopup({ change }: { change: LevelChange }) {
  const t = useTranslation();
  const text = t.island.levelPopup;
  const percent = Math.round(change.level * 100);
  const muted = change.kind === "volume" && (change.muted || percent === 0);
  const Icon = change.kind === "brightness" ? Sun : muted ? VolumeX : percent < 50 ? Volume1 : Volume2;
  const label = change.kind === "brightness" ? text.brightness(percent) : muted ? text.muted : text.volume(percent);

  return (
    <span
      className={`level-popup level-popup--${change.kind}${muted ? " level-popup--muted" : ""}`}
      role="status"
      aria-label={label}
      style={{ "--level": muted ? 0 : change.level } as CSSProperties}
    >
      <Icon className="level-popup__icon" size={16} strokeWidth={2.2} aria-hidden="true" />
      <span className="level-popup__track" aria-hidden="true">
        <span className="level-popup__fill" />
      </span>
      <span className="level-popup__value" aria-hidden="true">{muted ? text.mutedShort : percent}</span>
    </span>
  );
}
