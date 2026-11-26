import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { MessageSourceIcon } from "./MessageSourceIcon";
import { isOfficeSource, messagePreviewText, type MessagePreview } from "./messagePreview";
import { useTranslation } from "../../i18n";
import "./CollapsedMessageContent.css";

type ContentTransition = {
  key: string;
  current: MessagePreview | null;
  previous: MessagePreview | null | undefined;
  previousContent?: ReactNode;
  version: number;
  animated: boolean;
  previousAnimated: boolean;
};

function MessageContent({ preview }: { preview: MessagePreview }) {
  const t = useTranslation();
  return <>
    <MessageSourceIcon source={preview.source} size={16} />
    {preview.source === "qqMail" && preview.otpCode ? (
      <span className="island-message-preview__body">{preview.title.trim() || preview.body}</span>
    ) : preview.source === "qq" || (preview.source === "wechat" && preview.title) || isOfficeSource(preview.source) ? (
      <span className="island-message-preview__text">
        <strong className="island-message-preview__sender">{preview.title.trim() || (isOfficeSource(preview.source) ? t.messages.sourceLabels[preview.source] : "QQ")}</strong>
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
  contentKey,
  children,
}: {
  preview: MessagePreview | null;
  enabled: boolean;
  contentKey: string;
  children: ReactNode;
}) {
  const t = useTranslation();
  const current = enabled ? preview : null;
  const key = current ? JSON.stringify([current.source, current.receivedAt, current.title, current.body, current.otpCode]) : `summary:${contentKey}`;
  const [transition, setTransition] = useState<ContentTransition>({ key, current, previous: undefined, version: 0, animated: false, previousAnimated: false });
  const lastContent = useRef(children);
  useLayoutEffect(() => { lastContent.current = children; }, [children]);

  // Retain just the departing row; identical snapshots must not restart the entrance.
  if (key !== transition.key || (!enabled && (transition.previous !== undefined || transition.animated))) {
    setTransition({
      key, current, previous: enabled ? transition.current : undefined, version: transition.version + 1,
      previousContent: enabled && transition.current === null ? lastContent.current : undefined,
      animated: enabled, previousAnimated: transition.animated,
    });
  }

  const { previous, version } = transition;
  const moving = previous !== undefined;
  const settle = () => setTransition((state) => state.version === version && state.previous !== undefined
    ? { ...state, previous: undefined, previousContent: undefined } : state);

  useEffect(() => {
    if (!moving) return;
    const finish = () => setTransition((state) => state.version === version
      ? { ...state, previous: undefined, previousContent: undefined } : state);
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setTransition((state) => state.version === version
        ? { ...state, previous: undefined, previousContent: undefined, animated: false } : state);
      return;
    }
    // Hidden webviews may skip animationend; never retain an old message indefinitely.
    const timer = window.setTimeout(finish, 720);
    return () => window.clearTimeout(timer);
  }, [moving, version]);

  const label = current ? t.messages.qqPreview(t.messages.sourceLabels[current.source], messagePreviewText(current, t.messages)) : undefined;

  return (
    <span className="island__summary" role="status" aria-live="polite" aria-atomic="true" aria-label={label}
      data-direction={current ? "message" : "restore"}>
      {moving && (
        <span key={version - 1} className="island__summary-layer island__summary-layer--outgoing" aria-hidden="true">
          <span className={`island__summary-row${transition.previousAnimated ? " island__summary-row--animated" : ""}${previous ? " island-message-preview" : ""}`}>
            {previous ? <MessageContent preview={previous} /> : transition.previousContent}
          </span>
        </span>
      )}
      <span key={version} className={`island__summary-layer${moving ? " island__summary-layer--incoming" : ""}`}>
        <span className={`island__summary-row${transition.animated ? " island__summary-row--animated" : ""}${current ? " island-message-preview" : ""}`}
          onAnimationEnd={(event) => { if (event.target === event.currentTarget) settle(); }}>
          {current ? <MessageContent preview={current} /> : children}
        </span>
      </span>
    </span>
  );
}
