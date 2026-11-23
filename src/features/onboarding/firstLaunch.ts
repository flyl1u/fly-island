import { readString } from "../../lib/storage.ts";

// Read here as literals to keep this module free of the features it serves (the same keys as
// STORAGE_KEY in appearance/storage.ts and TODOS_STORAGE_KEY in todos/storage.ts).
const SETTINGS_KEY = "fly-island-settings";
const TODOS_KEY = "fly-island-todos";

let firstLaunch = false;
let captured = false;

/**
 * Notes whether this is the app's first launch: no settings and no todos were ever saved. Called
 * once in main.tsx before loading the settings, which may save them. A new user then finds a
 * welcome todo on the island and a short note on the file shelf, so neither looks empty.
 */
export function captureFirstLaunch() {
  if (captured) return;
  captured = true;
  firstLaunch = readString(SETTINGS_KEY) === null && readString(TODOS_KEY) === null;
}

export function isFirstLaunch() {
  return firstLaunch;
}
