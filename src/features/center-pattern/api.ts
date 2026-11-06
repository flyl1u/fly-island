import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";

/** Mirrors PetSource in src-tauri/src/pets/mod.rs: `<app data>/pets` or `~/.codex/pets`. */
export type PetSource = "app" | "codex";

/** Mirrors PetInfo in src-tauri/src/pets/mod.rs. */
export type PetInfo = { id: string; displayName: string; source: PetSource };

// Sheets are up to a few MB of base64, so each is fetched once per listing.
const spritesheets = new Map<string, Promise<string>>();
const failedSheets = new Set<string>();

/** Lists the pets again; a pet changed on disk is read afresh after this. */
export function listPets(): Promise<PetInfo[]> {
  spritesheets.clear();
  failedSheets.clear();
  return invoke<PetInfo[]>("list_pets");
}

/**
 * The pet's spritesheet as a `data:image/webp|png` URL; show it only through `<img>`. A failure
 * is kept too (until listPets) unless `retryFailed` asks again.
 */
export function getPetSpritesheet(id: string, { retryFailed = false } = {}): Promise<string> {
  if (retryFailed && failedSheets.delete(id)) spritesheets.delete(id);
  let sheet = spritesheets.get(id);
  if (!sheet) {
    sheet = invoke<string>("get_pet_spritesheet", { id });
    spritesheets.set(id, sheet);
    sheet.catch(() => failedSheets.add(id));
  }
  return sheet;
}

// Mirrors ISLAND_CURSOR_MOVED_EVENT in src-tauri/src/island/passthrough.rs.
export const ISLAND_CURSOR_MOVED_EVENT = "island-cursor-moved";
// Mirrors island::WINDOW_LABEL in src-tauri/src/island/mod.rs.
const ISLAND_WINDOW_LABEL = "main";

/** The cursor in the main window's CSS pixels (same space as clientX / clientY there). */
export type CursorPoint = { x: number; y: number };

let cursorUsers = 0;

/**
 * Whether this page can follow the cursor outside its window: only the island itself,
 * since the event's coordinates are the main window's (a settings preview gets none).
 */
export function canTrackIslandCursor(): boolean {
  try {
    return getCurrentWindow().label === ISLAND_WINDOW_LABEL;
  } catch {
    return false;
  }
}

/** Starts `island-cursor-moved` for one more user; the native switch flips on the first. */
export function acquireIslandCursor(): void {
  cursorUsers += 1;
  if (cursorUsers === 1) void invoke("set_island_cursor_tracking", { enabled: true }).catch(() => undefined);
}

/** Ends one `acquireIslandCursor`; the native switch flips off with the last. */
export function releaseIslandCursor(): void {
  if (cursorUsers === 0) return;
  cursorUsers -= 1;
  if (cursorUsers === 0) void invoke("set_island_cursor_tracking", { enabled: false }).catch(() => undefined);
}

export function listenIslandCursor(handler: (point: CursorPoint) => void): Promise<UnlistenFn> {
  return listen<CursorPoint>(ISLAND_CURSOR_MOVED_EVENT, ({ payload }) => handler(payload));
}
