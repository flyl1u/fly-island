import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

// Mirrors TOP_ATTACHMENT_CHANGED_EVENT in src-tauri/src/island/top_edge.rs.
export const TOP_ATTACHMENT_CHANGED_EVENT = "island-top-attachment-changed";

/** Whether the island currently sits flush with the top edge of its monitor. */
export function getIslandTopAttachment(): Promise<boolean> {
  return invoke<boolean>("get_island_top_attachment");
}

export function listenIslandTopAttachment(
  handler: (attached: boolean) => void,
): Promise<UnlistenFn> {
  return listen<boolean>(TOP_ATTACHMENT_CHANGED_EVENT, ({ payload }) => handler(payload));
}
