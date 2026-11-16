import { Check, Copy } from "lucide-react";
import { useTranslation } from "../../../i18n";
import "./MailOtpCode.css";
import { MAIL_OTP_ENABLED } from "../../releaseFlags.ts";

export function MailOtpCode({ code, copied, onCopy }: {
  code: string;
  copied: boolean;
  onCopy: (code: string) => Promise<boolean>;
}) {
  const t = useTranslation();
  if (!MAIL_OTP_ENABLED) return null;
  const label = copied ? t.mail.otpCopied : t.mail.copyOtp(code);
  return <button type="button" className="message-action mail-otp-code" aria-label={label} title={label}
    data-copied={copied || undefined} onClick={(event) => { event.stopPropagation(); void onCopy(code); }}>
    <span>{code}</span>
    {copied ? <Check size={14} strokeWidth={1.5} absoluteStrokeWidth aria-hidden="true" />
      : <Copy size={14} strokeWidth={1.5} absoluteStrokeWidth aria-hidden="true" />}
  </button>;
}
