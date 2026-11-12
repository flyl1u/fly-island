import { useEffect, useState, type ReactNode } from "react";
import { MessageSourceIcon } from "./MessageSourceIcon";
import { messagePreviewText, type MessagePreview } from "./messagePreview";
import { useTranslation } from "../../i18n";
import "./CollapsedMessageContent.css";

type ContentTransition = {
  key: string;
  current: MessagePreview | null;
  previous: MessagePreview | null | undefined;
  version: number;
  animated: boolean;
  previousAnimated: boolean;
};

function MessageContent({ preview }: { preview: MessagePreview }) {
  const t = useTranslation();
  return <>
    <MessageSourceIcon source={preview.source} size={16} />
    {preview.source === "qq" || (preview.source === "wechat" && preview.title) ? (
      <span className="island-message-preview__text">
        <strong className="island-message-preview__sender">{preview.title.trim() || "QQ"}</strong>
        <span className="island-message-preview__separator" aria-hidden="true">·</span>
        <span className="island-message-preview__body">{preview.body.trim() || t.messages.newMessage}</span>
      </span>
    ) : (
      <span className="island-message-preview__body">{messagePreviewText(preview, t.messages)}</span>
    )}
  </>;
}

export function CollapsedMessageContent({
  preview,
  enabled,
  children,
}: {
  preview: MessagePreview | null;
  enabled: boolean;
  children: ReactNode;
}) {
  const t = useTranslation();
  const current = enabled ? preview : null;
  const key = current ? JSON.stringify([current.source, current.receivedAt, current.title, current.body]) : "idle";
  const [transition, setTransition] = useState<ContentTransition>({ key, current, previous: undefined, version: 0, animated: false, previousAnimated: false });

  // Retain just the departing row; identical snapshots must not restart the entrance.
  if (key !== transition.key || (!enabled && (transition.previous !== undefined || transition.animated))) {
    setTransition({
      key, current, previous: enabled ? transition.current : undefined, version: transition.version + 1,
      animated: enabled, previousAnimated: transition.animated,
    });
  }

  const { previous, version } = transition;
  const moving = previous !== undefined;
  const settle = () => setTransition((state) => state.version === version && state.previous !== undefined
    ? { ...state, previous: undefined } : state);

  useEffect(() => {
    if (!moving) return;
    const finish = () => setTransition((state) => state.version === version
      ? { ...state, previous: undefined } : state);
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setTransition((state) => state.version === version
        ? { ...state, previous: undefined, animated: false } : state);
      return;
    }
    // Hidden webviews may skip animationend; never retain an old message indefinitely.
    const timer = window.setTimeout(finish, 720);
    return () => window.clearTimeout(timer);
  }, [moving, version]);

  const label = current ? t.messages.qqPreview(t.messages.sourceLabels[current.source], messagePreviewText(current, t.messages)) : undefined;
  const row = (message: MessagePreview | null) => message ? <MessageContent preview={message} /> : children;

  return (
    <span className="island__summary" role="status" aria-live="polite" aria-atomic="true" aria-label={label}
      data-direction={current ? "message" : "restore"}>
      {moving && (
        <span key={version - 1} className="island__summary-layer island__summary-layer--outgoing" aria-hidden="true">
          <span className={`island__summary-row${transition.previousAnimated ? " island__summary-row--animated" : ""}${previous ? " island-message-preview" : ""}`}>
            {row(previous)}
          </span>
        </span>
      )}
      <span key={version} className={`island__summary-layer${moving ? " island__summary-layer--incoming" : ""}`}>
        <span className={`island__summary-row${transition.animated ? " island__summary-row--animated" : ""}${current ? " island-message-preview" : ""}`}
          onAnimationEnd={(event) => { if (event.target === event.currentTarget) settle(); }}>
          {row(current)}
        </span>
      </span>
    </span>
  );
}
