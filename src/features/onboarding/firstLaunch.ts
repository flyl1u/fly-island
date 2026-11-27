import { readString } from "../../lib/storage.ts";

// Read here as literals to keep this module free of the features it serves (the same keys as
// STORAGE_KEY in appearance/storage.ts and TODOS_STORAGE_KEY in todos/storage.ts).
const SETTINGS_KEY = "fly-island-settings";
const TODOS_KEY = "fly-island-todos";

let firstLaunch = false;
let captured = false;

/**
 * Remembers the startup coordinator's decision before settings are loaded. Direct callers without
 * a decision retain the old no-settings/no-todos check. A new user then finds a
 * welcome todo on the island and a short note on the file shelf, so neither looks empty.
 */
export function captureFirstLaunch(initialized?: boolean) {
  if (captured) return;
  captured = true;
  firstLaunch = initialized ?? (readString(SETTINGS_KEY) === null && readString(TODOS_KEY) === null);
}

export function isFirstLaunch() {
  return firstLaunch;
}
