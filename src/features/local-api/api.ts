import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

// 与 src-tauri/src/local_api/bridge.rs 中的 REQUEST_EVENT 对应。
export const LOCAL_API_REQUEST_EVENT = "local-api-request";

// 与 src-tauri/src/local_api/mod.rs 中的 LocalApiState 对应。
export type LocalApiState = {
  enabled: boolean;
  allowWrite: boolean;
  running: boolean;
  url: string;
  token: string;
  configPath: string;
  error: string | null;
};

// 与 src-tauri/src/local_api/bridge.rs 中的 BridgeRequest 对应。
export type LocalApiRequest = {
  id: number;
  method: string;
  params: unknown;
};

// 与 src-tauri/src/local_api/bridge.rs 中的 BridgeResponse 对应。
export type LocalApiResponse =
  | { ok: true; data: unknown }
  | { ok: false; status: number; error: string };

export function getLocalApiState() {
  return invoke<LocalApiState>("get_local_api_state");
}

export function setLocalApiSettings(enabled: boolean, allowWrite: boolean) {
  return invoke<LocalApiState>("set_local_api_settings", { enabled, allowWrite });
}

export function resetLocalApiToken() {
  return invoke<LocalApiState>("reset_local_api_token");
}

export function answerLocalApiRequest(id: number, response: LocalApiResponse) {
  return invoke<void>("answer_local_api_request", { id, response });
}

export function listenLocalApiRequests(handler: (request: LocalApiRequest) => void) {
  return listen<LocalApiRequest>(LOCAL_API_REQUEST_EVENT, (event) => handler(event.payload));
}
