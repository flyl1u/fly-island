import { useEffect, useState } from "react";
import type { MessagePreview } from "../../features/messages/messagePreview";
import { listenIslandHover } from "./api";
import { hasIslandSelection } from "./useHoverFocus";

/**
 * The message preview to show, kept while the cursor is on the island: reading a long one and
 * selecting its text takes longer than its seconds, and it used to go mid-selection, the island
 * then opening under the cursor as hover-expand came back (v3.2.6 user report). Released once the
 * cursor leaves; `enabled` false (game mode, which passes clicks through) never keeps one.
 */
export function useHeldPreview(preview: MessagePreview | null, enabled: boolean, isCurrent?: (preview: MessagePreview) => boolean) {
  const [hovering, setHovering] = useState(false);
  const [kept, setKept] = useState<MessagePreview | null>(null);
  useEffect(() => {
    let cancelled = false;
    let unlisten: (() => void) | undefined;
    void listenIslandHover(setHovering)
      .then((next) => { if (cancelled) next(); else unlisten = next; })
      .catch((error: unknown) => console.error("Failed to listen for island hover", error));
    return () => { cancelled = true; unlisten?.(); };
  }, []);
  // Preview objects are rebuilt every render; one message is one receivedAt.
  if (preview && kept?.receivedAt !== preview.receivedAt) setKept(preview);
  // A selection made in the reader keeps it too, even after the cursor slips off while dragging.
  const holding = enabled && (hovering || hasIslandSelection());
  const canKeep = holding && kept !== null && (isCurrent?.(kept) ?? true);
  if (!preview && kept && !canKeep) setKept(null);
  return preview ?? (canKeep ? kept : null);
}
