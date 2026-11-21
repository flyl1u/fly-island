import type { LocaleCode } from "../../i18n";

/** src-tauri/src/eye_care/model.rs::BreakState */
export type EyeCareBreak = {
  deadline: number;
  canSnooze: boolean;
  canSkip: boolean;
  language: LocaleCode;
};
