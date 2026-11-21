import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { runPluginAction } from "../../features/plugins";
import type { EyeCareBreak } from "../../features/eye-care/types";

export const EYE_CARE_EVENT = "eye-care-break-changed";
export const getEyeCareBreak = () => invoke<EyeCareBreak | null>("get_eye_care_break");
export const showEyeCareBreakWindow = () => invoke<void>("show_eye_care_break_window");
export const onEyeCareBreak = (changed: (snapshot: EyeCareBreak | null) => void) =>
  listen<EyeCareBreak | null>(EYE_CARE_EVENT, (event) => changed(event.payload));
export const runEyeCareAction = (action: string) => runPluginAction("eye-care", action);
