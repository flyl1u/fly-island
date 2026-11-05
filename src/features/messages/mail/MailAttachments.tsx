import { useState } from "react";
import { isTauri } from "@tauri-apps/api/core";
import { Check, Download, LoaderCircle, Paperclip } from "lucide-react";
import { useTranslation } from "../../../i18n";
import { formatBytes } from "../../../utils/bytes";
import { saveMailAttachment, type MailAttachment } from "./api";

type SaveState = { status: "saving" } | { status: "saved"; path: string } | { status: "error"; message: string };

/** The open mail's attachments; 保存 writes one into Downloads and shows it in Explorer. */
export function MailAttachments({ account, messageId, attachments }: { account: string; messageId: string; attachments: MailAttachment[] }) {
  const t = useTranslation();
  const [states, setStates] = useState<Record<string, SaveState>>({});
  if (attachments.length === 0) return null;

  const save = async (part: string) => {
    if (!isTauri()) { setStates((current) => ({ ...current, [part]: { status: "error", message: t.mail.desktopRead } })); return; }
    setStates((current) => ({ ...current, [part]: { status: "saving" } }));
    try {
      const path = await saveMailAttachment(account, messageId, part);
      setStates((current) => ({ ...current, [part]: { status: "saved", path } }));
    } catch (error) {
      setStates((current) => ({ ...current, [part]: { status: "error", message: String(error) } }));
    }
  };

  return (
    <section className="qq-mail-attachments" aria-label={t.mail.attachments(attachments.length)}>
      <h3 className="qq-mail-attachments__title"><Paperclip size={13} strokeWidth={1.8} aria-hidden="true" />{t.mail.attachments(attachments.length)}</h3>
      <ul>
        {attachments.map((attachment) => {
          const state = states[attachment.part];
          const saved = state?.status === "saved" ? state.path : null;
          return (
            <li key={attachment.part} className="qq-mail-attachment">
              <span className="qq-mail-attachment__name" title={attachment.name}>{attachment.name}</span>
              <span className="qq-mail-attachment__size">{formatBytes(attachment.size)}</span>
              <button className="message-action" type="button" disabled={state?.status === "saving"} title={saved ?? t.mail.saveAttachmentHint}
                aria-label={`${saved ? t.mail.attachmentSaved : t.mail.saveAttachment} · ${attachment.name}`} onClick={() => void save(attachment.part)}>
                {state?.status === "saving" ? <LoaderCircle size={13} strokeWidth={1.8} className="qq-mail-spinning" /> : saved ? <Check size={13} strokeWidth={1.8} /> : <Download size={13} strokeWidth={1.8} />}
                {saved ? t.mail.attachmentSaved : t.mail.saveAttachment}
              </button>
              {state?.status === "error" ? <p className="qq-panel__error" role="alert">{state.message}</p> : null}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
