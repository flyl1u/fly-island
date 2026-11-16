import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "../../../i18n";
import { copyMailOtp, type MailEvent } from "./api";
import { MAIL_OTP_ENABLED } from "../../releaseFlags.ts";

/** Shared feedback for the preview and list; only the island subscribes to arrival copying. */
export function useMailOtp(autoCopy: boolean, reportError: (message: string) => void) {
  const t = useTranslation();
  const [copiedOtp, setCopiedOtp] = useState<string | null>(null);
  const feedbackTimer = useRef<number | undefined>(undefined);
  const arrivals = useRef(new Set<string>());
  const autoCopyRef = useRef(autoCopy);
  const mounted = useRef(true);
  autoCopyRef.current = autoCopy;

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; window.clearTimeout(feedbackTimer.current); };
  }, []);

  const copyOtp = useCallback(async (code: string) => {
    if (!MAIL_OTP_ENABLED) return false;
    window.clearTimeout(feedbackTimer.current);
    setCopiedOtp(null);
    try {
      await copyMailOtp(code);
      if (mounted.current) {
        reportError("");
        setCopiedOtp(code);
        feedbackTimer.current = window.setTimeout(() => setCopiedOtp(null), 1_500);
      }
      return true;
    } catch {
      if (mounted.current) reportError(t.mail.copyOtpFailed);
      return false;
    }
  }, [reportError, t.mail.copyOtpFailed]);

  const copyArrival = useCallback((event: MailEvent) => {
    if (!MAIL_OTP_ENABLED) return;
    const { snapshot } = event;
    const id = event.otpMessageId ?? event.newestId;
    if (!id || !snapshot.email || !snapshot.enabled || snapshot.status !== "connected") return;
    const message = snapshot.items.find((item) => item.id === id && item.unread && item.otpCode);
    if (!message?.otpCode) return;
    const key = `${snapshot.email}:${id}`;
    if (arrivals.current.has(key)) return;
    arrivals.current.add(key);
    // Bound the session-only deduplication set without retaining mail bodies or codes.
    if (arrivals.current.size > 128) arrivals.current.delete(arrivals.current.values().next().value!);
    if (autoCopyRef.current) void copyOtp(message.otpCode);
  }, [copyOtp]);

  return { copyOtp, copiedOtp, copyArrival };
}
