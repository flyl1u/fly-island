import type { CSSProperties } from "react";
import { ringArc, ringRadius, segmentStarts } from "../utils/ring.ts";
import "./MiniRing.css";

/** One concentric ring: `value` 0–1 of the way round, on its own track. */
export type MiniRingTrack = { value: number; color: string; trackColor?: string };
/** One part of a single segmented ring: `value` 0–1 of the circle. */
export type MiniRingSegment = { value: number; color: string };

type MiniRingProps = {
  /** Concentric rings, outermost first. Ignored when `segments` is given. */
  rings?: readonly MiniRingTrack[];
  /** One ring split into parts in this order, clockwise from 12 o'clock. */
  segments?: readonly MiniRingSegment[];
  /** Outer size in px (default 20). */
  size?: number;
  /** Stroke width in px (default 2.5). */
  strokeWidth?: number;
  /** Space between concentric rings, and between segments, in px (default 1.5). */
  gap?: number;
  /** Track under every ring that sets none (default rgba(255, 255, 255, 0.16)). */
  trackColor?: string;
  /** Short text in the middle, e.g. a count. */
  label?: string;
  /** What the ring says, for screen readers; the caller translates it. */
  ariaLabel: string;
  /** Hover tooltip; the caller translates it. */
  title?: string;
  className?: string;
};

const DEFAULT_TRACK = "rgba(255, 255, 255, 0.16)";

/** A small SVG progress ring: concentric rings, or one ring in coloured segments. */
export function MiniRing({
  rings = [],
  segments,
  size = 20,
  strokeWidth = 2.5,
  gap = 1.5,
  trackColor = DEFAULT_TRACK,
  label,
  ariaLabel,
  title,
  className,
}: MiniRingProps) {
  const center = size / 2;
  const circle = (key: string, radius: number, color: string, arc: ReturnType<typeof ringArc> | "track") => (
    <circle
      key={key}
      className={arc === "track" ? "mini-ring__track" : "mini-ring__arc"}
      cx={center}
      cy={center}
      r={radius}
      stroke={color}
      strokeWidth={strokeWidth}
      strokeDasharray={arc === "track" ? undefined : arc?.dashArray}
      strokeDashoffset={arc === "track" ? undefined : arc?.dashOffset}
    />
  );
  const parts = [];
  if (segments) {
    const radius = ringRadius(size, strokeWidth, 0, gap);
    const shown = segmentStarts(segments.map((segment) => segment.value));
    // Gaps only separate neighbours; a lone segment closes the ring.
    const segmentGap = shown.filter((segment) => segment.share > 0).length > 1 ? gap : 0;
    parts.push(circle("track", radius, trackColor, "track"));
    shown.forEach(({ start, share }, index) => {
      const arc = ringArc(radius, strokeWidth, start, share, segmentGap);
      if (arc) parts.push(circle(`segment-${index}`, radius, segments[index].color, arc));
    });
  } else {
    rings.forEach((ring, index) => {
      const radius = ringRadius(size, strokeWidth, index, gap);
      if (radius <= 0) return;
      parts.push(circle(`track-${index}`, radius, ring.trackColor ?? trackColor, "track"));
      const arc = ringArc(radius, strokeWidth, 0, ring.value);
      if (arc) parts.push(circle(`ring-${index}`, radius, ring.color, arc));
    });
  }

  return (
    <span
      className={["mini-ring", className].filter(Boolean).join(" ")}
      role="img"
      aria-label={ariaLabel}
      title={title}
      style={{ "--mini-ring-size": `${size}px` } as CSSProperties}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        {/* Turned a quarter back so every arc starts at 12 o'clock and runs clockwise. */}
        <g transform={`rotate(-90 ${center} ${center})`}>{parts}</g>
      </svg>
      {label && <span className="mini-ring__label" aria-hidden="true">{label}</span>}
    </span>
  );
}
