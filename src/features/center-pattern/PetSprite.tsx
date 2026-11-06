import { useState, type CSSProperties } from "react";
import { PET_CELL_HEIGHT, PET_CELL_WIDTH, petSheetRows, petSpriteLayout, type PetMood } from "./patterns";
import "./PetSprite.css";

type PetSpriteProps = {
  /** The spritesheet URL from `getPetSpritesheet`. */
  src: string;
  mood: PetMood;
  /** Freeze on the current frame: the island is expanded or tucked away. */
  paused?: boolean;
  /** CSS pixels of one frame's height; the width keeps the 192:208 cell. */
  height?: number;
};

/** A Codex pet (petdex spritesheet) playing the row for `mood` with CSS `steps()`. */
export function PetSprite({ src, mood, paused = false, height = 22 }: PetSpriteProps) {
  // Rows are only known once the image has loaded: 9, or 11 for a v2 atlas.
  const [sheet, setSheet] = useState<{ src: string; rows: number | null } | null>(null);
  const rows = sheet?.src === src ? sheet.rows : null;
  const layout = petSpriteLayout(mood, rows ?? 9);
  const style = {
    "--pet-height": `${height}px`,
    "--pet-width": `${(height * PET_CELL_WIDTH) / PET_CELL_HEIGHT}px`,
    "--pet-row-shift": `${layout.rowShift}%`,
    "--pet-loop-shift": `${layout.loopShift}%`,
    "--pet-frames": layout.frames,
    "--pet-duration": `${layout.durationMs}ms`,
  } as CSSProperties;

  return (
    <span
      className="pet-sprite"
      style={style}
      data-mood={mood}
      data-ready={rows !== null || undefined}
      data-paused={paused || undefined}
      aria-hidden="true"
    >
      <span className="pet-sprite-row">
        <img
          // Restart the loop from the first frame when the row changes.
          key={mood}
          className="pet-sprite-sheet"
          src={src}
          alt=""
          draggable={false}
          onLoad={(event) => {
            const image = event.currentTarget;
            setSheet({ src, rows: petSheetRows(image.naturalWidth, image.naturalHeight) });
          }}
        />
      </span>
    </span>
  );
}
