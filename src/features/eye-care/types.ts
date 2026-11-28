import type { LocaleCode } from "../../i18n";

/** src-tauri/src/eye_care/model.rs::BreakState */
export type EyeCareBreak = {
  /** Unix milliseconds the break began; the window counts the rest up from here. */
  startedAt: number;
  canSnooze: boolean;
  canSkip: boolean;
  /** 0–100 share of the break behind the user; null when the plugin cannot measure it. */
  percent: number | null;
  /** The break ran its full length: the window stays, counting up, until the user acts. */
  done: boolean;
  language: LocaleCode;
};
