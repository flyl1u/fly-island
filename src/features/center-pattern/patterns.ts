// Pure logic for the collapsed island's center pattern: the built-in patterns, the Codex
// Pets (petdex) spritesheet layout, and where the eyes look.

export const CENTER_PATTERNS = ["eyes", "bird", "orb", "cat"] as const;
export type CenterPatternId = (typeof CENTER_PATTERNS)[number];

/** What a pet acts out; the caller maps agent state onto it. */
export type PetMood = "idle" | "running" | "waiting" | "failed" | "done";

// petdex: 8 columns of 192×208 cells; 9 rows, or 11 in the v2 atlas (rows 10–11 unused here).
export const PET_SHEET_COLUMNS = 8;
export const PET_CELL_WIDTH = 192;
export const PET_CELL_HEIGHT = 208;
const PET_SHEET_ROW_COUNTS = [9, 11];

type PetRow = { row: number; frames: number; durationMs: number };

// Rows, frame counts and loop lengths from petdex's renderer state table
// (packages/petdex-desktop-native/src/sprite.zig). shortcut: frames play evenly, idle's
// irregular blink timing is flattened; switch to per-frame keyframes if it looks off.
const PET_ROWS: Record<PetMood, PetRow> = {
  idle: { row: 0, frames: 6, durationMs: 1100 },
  running: { row: 7, frames: 6, durationMs: 820 },
  waiting: { row: 6, frames: 6, durationMs: 1010 },
  failed: { row: 5, frames: 8, durationMs: 1220 },
  done: { row: 3, frames: 4, durationMs: 700 }, // waving
};

export function petRow(mood: PetMood): PetRow {
  return PET_ROWS[mood] ?? PET_ROWS.idle;
}

/** Rows in a sheet of this pixel size (a clean scale of 8×9 or 8×11 cells), or null. */
export function petSheetRows(width: number, height: number): number | null {
  if (!(width > 0 && height > 0)) return null;
  const cellHeight = (width / PET_SHEET_COLUMNS) * (PET_CELL_HEIGHT / PET_CELL_WIDTH);
  const rows = height / cellHeight;
  return PET_SHEET_ROW_COUNTS.find((count) => Math.abs(rows - count) < 0.02) ?? null;
}

export type PetSpriteLayout = {
  /** translateY of the whole sheet, as % of its own height, to bring the row into view. */
  rowShift: number;
  /** translateX at the end of the loop, as % of the sheet width; `steps(frames)` gets there. */
  loopShift: number;
  frames: number;
  durationMs: number;
};

export function petSpriteLayout(mood: PetMood, rows: number): PetSpriteLayout {
  const { row, frames, durationMs } = petRow(mood);
  return {
    rowShift: -(row / rows) * 100,
    loopShift: -(frames / PET_SHEET_COLUMNS) * 100,
    frames,
    durationMs,
  };
}

/**
 * Pupil offset (SVG units) looking from an eye towards a point `dx`, `dy` CSS pixels away:
 * straight at it, all the way to `max` once the point is `reach` pixels or more away.
 */
export function gazeOffset(dx: number, dy: number, max: number, reach = 90): { x: number; y: number } {
  const distance = Math.hypot(dx, dy);
  if (!Number.isFinite(distance) || distance < 0.5) return { x: 0, y: 0 };
  const length = max * Math.min(1, distance / reach);
  // Eyes are taller than wide on screen but the pupil travels less vertically.
  return { x: (dx / distance) * length, y: (dy / distance) * length * 0.75 };
}
