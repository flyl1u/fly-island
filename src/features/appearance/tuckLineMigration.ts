import type { IslandSettings } from "./types";

type MigrationStorage = {
  completed: boolean;
  saveSettings: (settings: IslandSettings) => boolean;
  markComplete: () => boolean;
};

/** Move the old saved style once; never mark a failed settings write as complete. */
export function migrateTuckLine(settings: IslandSettings, hasSaved: boolean, storage: MigrationStorage): IslandSettings {
  if (storage.completed) return settings;
  if (!hasSaved) {
    storage.markComplete();
    return settings;
  }
  const next: IslandSettings = { ...settings, tuckStyle: "line" };
  if (!storage.saveSettings(next)) return settings;
  storage.markComplete();
  return next;
}
