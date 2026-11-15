import { readString, writeString } from "../../lib/storage.ts";
// Whether the user has opened the community group in About; until then the settings button,
// About in the sidebar and the group row carry a red dot.
export const COMMUNITY_INVITE_SEEN_KEY = "focusd-island-community-invite-seen";

/** Told within the window that opened the group; other windows get a storage event. */
export const COMMUNITY_INVITE_SEEN_EVENT = "focusd-community-invite-seen";

export function loadCommunityInviteSeen(): boolean {
  return readString(COMMUNITY_INVITE_SEEN_KEY) === "true";
}

export function saveCommunityInviteSeen() {
  if (writeString(COMMUNITY_INVITE_SEEN_KEY, "true")) window.dispatchEvent(new Event(COMMUNITY_INVITE_SEEN_EVENT));
}

// Whether the island checks, downloads and installs updates by itself; on unless turned off.
export const AUTO_UPDATE_KEY = "focusd-island-auto-update";

export function loadAutoUpdate(): boolean {
  return readString(AUTO_UPDATE_KEY) !== "false";
}

export function saveAutoUpdate(enabled: boolean) {
  return writeString(AUTO_UPDATE_KEY, enabled ? "true" : "false");
}

