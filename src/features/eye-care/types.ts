import type { LocaleCode } from "../../i18n";

/** src-tauri/src/eye_care/model.rs::BreakState */
export type EyeCareBreak = {
  deadline: number;
  canSnooze: boolean;
  canSkip: boolean;
  /** 0–100 share of the break still ahead; null when the plugin cannot measure it. */
  percent: number | null;
  language: LocaleCode;
};
