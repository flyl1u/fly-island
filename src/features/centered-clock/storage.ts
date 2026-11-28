import { readJson, writeJson } from "../../lib/storage.ts";
import { normalizeCenteredClockSettings, type CenteredClockSettings } from "./model.ts";

export const CENTERED_CLOCK_KEY = "fly-island-centered-clock";
export const loadCenteredClockSettings = () => normalizeCenteredClockSettings(readJson(CENTERED_CLOCK_KEY));
export const saveCenteredClockSettings = (settings: CenteredClockSettings) =>
  writeJson(CENTERED_CLOCK_KEY, normalizeCenteredClockSettings(settings));
