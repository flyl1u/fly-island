import { invoke } from "@tauri-apps/api/core";
import { emit, emitTo, listen } from "@tauri-apps/api/event";
import type { UpdateState } from "./updaterController";

export type UpdateAction = "snapshot" | "check" | "install" | "dismiss";
const UPDATE_STATE_EVENT = "focusd-update-state";
const UPDATE_REQUEST_EVENT = "focusd-update-request";

export function listenUpdateState(callback: (state: UpdateState) => void) {
  return listen<UpdateState>(UPDATE_STATE_EVENT, (event) => callback(event.payload));
}

export function listenUpdateRequests(callback: (action: UpdateAction) => void) {
  return listen<UpdateAction>(UPDATE_REQUEST_EVENT, (event) => callback(event.payload));
}

export function publishUpdateState(state: UpdateState) {
  return emit(UPDATE_STATE_EVENT, state);
}

export function requestUpdateAction(action: UpdateAction) {
  return emitTo("main", UPDATE_REQUEST_EVENT, action);
}

export function isUpdaterConfigured() {
  return invoke<boolean>("updater_configured");
}

export function getUpdaterProxy() {
  return invoke<string | null>("get_updater_proxy");
}
