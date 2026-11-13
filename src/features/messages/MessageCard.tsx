import { useTranslation } from "../../i18n";
import { MessageSourceIcon } from "./MessageSourceIcon";
import { formatMessageCardTime, splitMessageSender } from "./messageCardText";
import "./MessageCard.css";

type MessageCardProps = {
  source: "qq" | "wechat";
  name: string;
  timestamp: number;
  body: string;
  messageId?: string;
  muted?: boolean;
  disabled?: boolean;
  ariaLabel?: string;
  onOpen?: () => void;
};

export function MessageCard({ source, name, timestamp, body, messageId, muted, disabled, ariaLabel, onOpen }: MessageCardProps) {
  const t = useTranslation();
  const sender = muted ? null : splitMessageSender(body);
  const date = new Date(timestamp);
  const content = <>
    <div className="message-card__heading">
      <MessageSourceIcon source={source} size={18} />
      <strong className="message-card__name">{name}</strong>
      <time dateTime={Number.isFinite(date.getTime()) ? date.toISOString() : undefined}>{formatMessageCardTime(timestamp, Date.now(), t.messages.yesterday)}</time>
    </div>
    {body && <p className={`message-card__body${muted ? " message-card__body--muted" : ""}`}>
      {sender ? <><strong>{sender.sender}</strong>{sender.separator}{sender.content}</> : body}
    </p>}
  </>;
  return <article className="message-card" role="listitem" data-message-id={messageId}>
    {onOpen ? <button className="message-card__surface" type="button" disabled={disabled} aria-label={ariaLabel} onClick={onOpen}>{content}</button>
      : <div className="message-card__surface">{content}</div>}
  </article>;
}
