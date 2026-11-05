import { useCallback, useEffect, useRef, useState } from "react";
import { isTauri } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";
import type { Translations } from "../../../i18n";
import { readQQMail, type MailContent, type MailMessage } from "./api";

/** The in-island reader: which mail of which mailbox is open, its body, and loading state. */
export function useMailReader(t: Translations, onOpen: () => void, onError: (message: string) => void) {
  const [selectedMail, setSelectedMail] = useState<MailMessage | null>(null);
  const [readerAccount, setReaderAccount] = useState<string | null>(null);
  const [content, setContent] = useState<MailContent | null>(null);
  const [reading, setReading] = useState(false);
  const [readError, setReadError] = useState<string | null>(null);
  // A request counter: bumping it makes responses of older reads land nowhere.
  const requestRef = useRef(0);

  useEffect(() => {
    const requests = requestRef;
    return () => { ++requests.current; };
  }, []);

  const closeReader = useCallback(() => {
    ++requestRef.current;
    setSelectedMail(null);
    setReaderAccount(null);
    setContent(null);
    setReadError(null);
    setReading(false);
  }, []);

  const readMail = useCallback(async (account: string, message: MailMessage) => {
    const requestId = ++requestRef.current;
    setSelectedMail(message);
    setReaderAccount(account);
    setContent(null);
    setReadError(null);
    onOpen();
    if (!isTauri()) { setReadError(t.mail.desktopRead); setReading(false); return false; }
    setReading(true);
    try {
      const next = await readQQMail(account, message.id);
      if (requestId !== requestRef.current) return false;
      if (next.id !== message.id) throw new Error(t.mail.changed);
      setContent(next);
      return true;
    } catch (error) {
      if (requestId === requestRef.current) setReadError(error instanceof Error ? error.message : String(error));
      return false;
    } finally {
      if (requestId === requestRef.current) setReading(false);
    }
  }, [onOpen, t]);

  const openLink = useCallback(async (href: string) => {
    if (!/^https?:\/\//i.test(href)) return;
    try { await openUrl(href); }
    catch { onError(t.mail.openLinkFailed); }
  }, [onError, t]);

  return { selectedMail, readerAccount, content, reading, readError, readMail, closeReader, openLink };
}
