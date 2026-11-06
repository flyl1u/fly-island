import { useCallback, useState } from "react";
import type { MessageView } from "../../features/messages/Messages";
import type { MessageSource } from "../../features/messages/messagePreview";
import type { IslandPage } from "./types";

/** Which message source the Messages page shows, and opening that page on a source. */
export function useMessageView(closeMailReader: () => void, openIslandPage: (page: IslandPage) => void) {
  const [messageSource, setMessageSource] = useState<MessageView>("qq");

  const openMessages = useCallback((source: MessageSource) => {
    closeMailReader();
    setMessageSource(source);
    openIslandPage("qq");
  }, [closeMailReader, openIslandPage]);

  return { messageSource, setMessageSource, openMessages };
}
