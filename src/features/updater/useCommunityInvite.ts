import { useEffect, useState } from "react";
import { COMMUNITY_INVITE_SEEN_EVENT, COMMUNITY_INVITE_SEEN_KEY, loadCommunityInviteSeen, saveCommunityInviteSeen } from "./storage.ts";

/**
 * Whether the community group still waits to be opened, followed in every window: the island's
 * settings button, About in the sidebar and the group row show a red dot until it is.
 */
export function useCommunityInvite() {
  const [seen, setSeen] = useState(loadCommunityInviteSeen);
  useEffect(() => {
    const reload = () => setSeen(loadCommunityInviteSeen());
    const sync = (event: StorageEvent) => {
      if (event.key === COMMUNITY_INVITE_SEEN_KEY || event.key === null) reload();
    };
    window.addEventListener("storage", sync);
    window.addEventListener(COMMUNITY_INVITE_SEEN_EVENT, reload);
    return () => {
      window.removeEventListener("storage", sync);
      window.removeEventListener(COMMUNITY_INVITE_SEEN_EVENT, reload);
    };
  }, []);
  return { pending: !seen, markSeen: saveCommunityInviteSeen };
}
