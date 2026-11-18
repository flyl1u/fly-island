import { useEffect, useState } from "react";
import { readMailContent, type MailMessage } from "./api";
import { mailContentText } from "./mailText";
import { useTranslation } from "../../../i18n";

/** Only the visible adaptive mail notice reads a body; late responses cannot replace a newer mail. */
export function useMailPreviewContent(preview: MailMessage | null, account: string | null, enabled: boolean) {
  const changed = useTranslation().mail.changed;
  const [loaded, setLoaded] = useState<{ key: string; text: string | null; error: string | null } | null>(null);
  const [attempt, setAttempt] = useState(0);
  const key = enabled && preview && account ? JSON.stringify([account, preview.id]) : null;
  const id = preview?.id;
  useEffect(() => {
    if (!key || !account || !id) { setLoaded(null); return; }
    let cancelled = false;
    void readMailContent(account, id).then((content) => {
      if (cancelled) return;
      if (content.id !== id) throw new Error(changed);
      setLoaded({ key, text: mailContentText(content), error: null });
    }).catch((error: unknown) => {
      if (!cancelled) setLoaded({ key, text: null, error: error instanceof Error ? error.message : String(error) });
    });
    return () => { cancelled = true; };
  }, [account, attempt, changed, id, key]);
  const current = key && loaded?.key === key ? loaded : null;
  return { text: current?.text ?? null, error: current?.error ?? null,
    loading: key !== null && current === null,
    retry: () => { setLoaded(null); setAttempt((value) => value + 1); } };
}
