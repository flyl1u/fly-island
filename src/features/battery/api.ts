import { invoke } from "@tauri-apps/api/core";
import type { ReadBatterySnapshot } from "./snapshot";

export const getNotebookBattery: ReadBatterySnapshot = (includeDetails) => {
  return invoke("get_notebook_battery", { includeDetails });
};
