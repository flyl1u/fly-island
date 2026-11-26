import type { EdgePetMood } from "./petState";

/**
 * 20x14 pixel-art cat sprite rendered with crisp SVG rects and semantic CSS classes.
 */
export function PixelCatSprite({ mood }: { mood: Exclude<EdgePetMood, "hidden"> }) {
  return (
    <svg
      className="edge-pet__svg"
      viewBox="0 0 20 14"
      width="30"
      height="21"
      shapeRendering="crispEdges"
      aria-hidden="true"
    >
      {/* Ears */}
      <rect className="edge-pet__body" x="3" y="1" width="2" height="2" />
      <rect className="edge-pet__body" x="9" y="1" width="2" height="2" />
      <rect className="edge-pet__accent" x="4" y="2" width="1" height="1" />
      <rect className="edge-pet__accent" x="9" y="2" width="1" height="1" />

      {/* Head & torso */}
      <rect className="edge-pet__body" x="3" y="3" width="8" height="4" />
      <rect className="edge-pet__body" x="4" y="7" width="10" height="4" />

      {/* Tail */}
      <g className="edge-pet__tail">
        <rect className="edge-pet__body" x="14" y="6" width="2" height="2" />
        <rect className="edge-pet__body" x="15" y="4" width="2" height="2" />
      </g>

      {/* Eyes */}
      <rect className="edge-pet__eye" x="4" y="4" width="1" height="2" />
      <rect className="edge-pet__eye" x="8" y="4" width="1" height="2" />

      {/* Whisker / nose accent */}
      <rect className="edge-pet__accent" x="6" y="5" width="1" height="1" />

      {/* Legs (2-frame alternating gait via CSS) */}
      <g className="edge-pet__legs-a">
        <rect className="edge-pet__body" x="4" y="11" width="2" height="2" />
        <rect className="edge-pet__body" x="11" y="11" width="2" height="2" />
      </g>
      <g className="edge-pet__legs-b">
        <rect className="edge-pet__body" x="6" y="11" width="2" height="2" />
        <rect className="edge-pet__body" x="12" y="11" width="2" height="2" />
      </g>

      {/* Mood indicator pixel badge */}
      {mood === "alert" && (
        <g className="edge-pet__badge">
          <rect className="edge-pet__badge-alert" x="17" y="1" width="2" height="3" />
          <rect className="edge-pet__badge-alert" x="17" y="5" width="2" height="1" />
        </g>
      )}
      {mood === "working" && (
        <g className="edge-pet__badge">
          <rect className="edge-pet__badge-work" x="1" y="8" width="2" height="2" />
          <rect className="edge-pet__badge-work" x="1" y="10" width="3" height="1" />
        </g>
      )}
      {mood === "music" && (
        <g className="edge-pet__badge">
          <rect className="edge-pet__badge-music" x="16" y="1" width="1" height="3" />
          <rect className="edge-pet__badge-music" x="17" y="1" width="2" height="1" />
          <rect className="edge-pet__badge-music" x="18" y="2" width="1" height="2" />
        </g>
      )}
    </svg>
  );
}
