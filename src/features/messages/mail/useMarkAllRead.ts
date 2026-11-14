import { useCallback, useRef, useState } from "react";
import { useTranslation } from "../../../i18n";
import type { MailSnapshot } from "./api";
import { markUnreadMailRead } from "./markAllRead";
import type { MailAccountsController } from "./useMailAccounts";

export function useMarkAllRead(snapshot: MailSnapshot, accounts: MailAccountsController) {
  const [markingAll, setMarkingAll] = useState(false);
  const pending = useRef(false);
  const { markRead, setActionError } = accounts;
  const failedMessage = useTranslation().messages.markAllReadFailed;
  const markAllRead = useCallback(async () => {
    if (pending.current || !snapshot.email) return;
    pending.current = true;
    setMarkingAll(true);
    try {
      const failed = await markUnreadMailRead(snapshot.email, snapshot.items, markRead);
      if (failed) setActionError(failedMessage);
    } finally {
      pending.current = false;
      setMarkingAll(false);
    }
  }, [snapshot.email, snapshot.items, markRead, setActionError, failedMessage]);
  return { markingAll, markAllRead };
}
