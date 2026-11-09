import { useEffect, useState, type CSSProperties } from "react";
import { clamp } from "../../utils/number";
import "./MusicWaveButton.css";

export function MusicWaveButton({
  isAvailable,
  isPlaying,
  audioPeak,
  label,
  onClick,
}: {
  isAvailable: boolean;
  isPlaying: boolean;
  audioPeak: number;
  label: string;
  onClick: () => void;
}) {
  const [phase, setPhase] = useState(0);
  const className = [
    "music-wave-button",
    isAvailable ? "music-wave-button--available" : "music-wave-button--idle",
    isPlaying ? "music-wave-button--playing" : "music-wave-button--paused",
  ]
    .filter(Boolean)
    .join(" ");
  const prefersReducedMotion =
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  // Only playing music moves the bars. A paused player used to keep them breathing, which
  // repainted the collapsed island several times a second for nothing.
  const shouldAnimate = isPlaying && !prefersReducedMotion;

  useEffect(() => {
    if (!shouldAnimate) {
      setPhase(0);
      return;
    }

    // 10 frames a second; the bars' 100ms CSS transition fills in between.
    const interval = window.setInterval(() => setPhase(performance.now() / 260), 100);
    return () => window.clearInterval(interval);
  }, [shouldAnimate]);

  const liftedPeak = isPlaying
    ? clamp(Math.log1p(clamp(audioPeak, 0, 1) * 150) / Math.log1p(150), 0, 1)
    : 0;
  const barScales = [0.34, 0.72, 0.48, 0.86, 0.42].map((bar, index) => {
    const floor = isAvailable ? 0.22 : 0.12;
    const breath = shouldAnimate ? 0.07 + Math.sin(phase + index * 0.82) * 0.045 : 0;
    const movement =
      liftedPeak *
      (0.26 + bar * 1.02) *
      (0.82 + Math.sin(phase * (1.15 + index * 0.08) + index * 1.7) * 0.24);

    return clamp(floor + breath + movement, 0.12, 1.22);
  });

  return (
    <button
      className={className}
      type="button"
      aria-label={label}
      onClick={(event) => {
        event.stopPropagation();
        onClick();
      }}
    >
      {barScales.map((scale, index) => (
        <span
          key={index}
          style={
            {
              "--wave-scale": scale.toFixed(3),
              "--wave-opacity": (0.42 + scale * 0.52).toFixed(3),
            } as CSSProperties
          }
        />
      ))}
    </button>
  );
}
