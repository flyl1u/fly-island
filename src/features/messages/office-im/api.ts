import { invoke } from "@tauri-apps/api/core";
import { listen, type EventCallback } from "@tauri-apps/api/event";
import type { OfficeSource } from "../messagePreview";

// Mirrors ClientState / OfficeImSnapshot in src-tauri/src/office_im/mod.rs.
export type OfficeClientState = {
  enabled: boolean;
  status: "disabled" | "listening" | "error";
  pending: boolean;
  lastAttentionAt: number | null;
  error: string | null;
};

export type OfficeImSnapshot = { revision: number } & Record<OfficeSource, OfficeClientState>;

// Same name as CHANGED_EVENT in office_im/mod.rs.
export const OFFICE_IM_CHANGED_EVENT = "office-im-changed";

export const getOfficeImState = () => invoke<OfficeImSnapshot>("get_office_im_state");
export const setOfficeImEnabled = (client: OfficeSource, enabled: boolean) => invoke<OfficeImSnapshot>("set_office_im_enabled", { client, enabled });
export const clearOfficeIm = (client: OfficeSource) => invoke<OfficeImSnapshot>("clear_office_im", { client });
export const openOfficeIm = (client: OfficeSource) => invoke<void>("open_office_im", { client });
export const listenOfficeImChanged = (handler: EventCallback<OfficeImSnapshot>) => listen<OfficeImSnapshot>(OFFICE_IM_CHANGED_EVENT, handler);
