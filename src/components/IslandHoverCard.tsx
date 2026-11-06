import { useEffect, useLayoutEffect, useRef, useState, type FocusEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import "./IslandHoverCard.css";

/** One line of the card; `color` draws a small dot before it (a ring's colour, a status). */
export type HoverCardLine = { text: string; color?: string; muted?: boolean };

type IslandHoverCardProps = {
  /** Lines from top to bottom; the caller translates them. */
  lines: readonly HoverCardLine[];
  /** The trigger, normally a button so keyboard focus shows the card too. */
  children: ReactNode;
  /** Pause before the card shows, in ms (default 200). */
  delayMs?: number;
  /**
   * Keeps the card shut, e.g. once the native side says the cursor left the island: the page
   * misses pointerleave when the window stops taking the cursor outside the island shape.
   */
  suppressed?: boolean;
  /** The element whose bottom edge the card sits under, centred (default ".island"; else the trigger). */
  alignTo?: string;
  /** Where the card is drawn; it inherits that element's CSS variables (default ".stage"; else body). */
  portalTo?: string;
  /** Extra class on the wrapper around `children`, e.g. to make it a block. */
  anchorClassName?: string;
};

const EDGE = 8;
const OFFSET = 8;

type Place = { top: number; center: number; root: Element };

/**
 * A small dark card under the island while the cursor rests on (or keyboard focus is in) its
 * trigger. Drawn outside the island so the island's clipping and scale do not touch it; it takes
 * no pointer events, so it never holds the island open or steals focus.
 */
export function IslandHoverCard({
  lines,
  children,
  delayMs = 200,
  suppressed = false,
  alignTo = ".island",
  portalTo = ".stage",
  anchorClassName,
}: IslandHoverCardProps) {
  const anchorRef = useRef<HTMLSpanElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef<number | undefined>(undefined);
  const [place, setPlace] = useState<Place | null>(null);
  const [left, setLeft] = useState<number | null>(null);

  const show = () => {
    const anchor = anchorRef.current;
    if (!anchor) return;
    const rect = (anchor.closest(alignTo) ?? anchor).getBoundingClientRect();
    setLeft(null);
    setPlace({ top: rect.bottom + OFFSET, center: rect.left + rect.width / 2, root: anchor.closest(portalTo) ?? document.body });
  };
  const hide = () => {
    window.clearTimeout(timerRef.current);
    setPlace(null);
  };
  const schedule = () => {
    window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(show, delayMs);
  };
  const onFocus = (event: FocusEvent) => {
    if (event.target instanceof Element && event.target.matches(":focus-visible")) show();
  };

  useEffect(() => {
    if (!suppressed) return;
    window.clearTimeout(timerRef.current);
    setPlace(null);
  }, [suppressed]);
  useEffect(() => () => window.clearTimeout(timerRef.current), []);

  // Centred under the island, then kept inside the window.
  useLayoutEffect(() => {
    const card = cardRef.current;
    if (!place || !card) return;
    const width = card.offsetWidth;
    setLeft(Math.min(Math.max(place.center - width / 2, EDGE), window.innerWidth - width - EDGE));
  }, [place, lines]);

  const open = place !== null && !suppressed && lines.length > 0;
  return (
    <span
      ref={anchorRef}
      className={anchorClassName ? `island-hover-card__anchor ${anchorClassName}` : "island-hover-card__anchor"}
      onPointerEnter={schedule}
      onPointerLeave={hide}
      onPointerDown={hide}
      onFocus={onFocus}
      onBlur={hide}
    >
      {children}
      {open && createPortal(
        <div
          ref={cardRef}
          className="island-hover-card"
          role="tooltip"
          style={{ top: place.top, left: left ?? place.center, visibility: left === null ? "hidden" : undefined }}
        >
          {lines.map((line, index) => (
            <div key={index} className={`island-hover-card__line${line.muted ? " island-hover-card__line--muted" : ""}`}>
              {line.color && <span className="island-hover-card__dot" style={{ background: line.color }} aria-hidden="true" />}
              <span>{line.text}</span>
            </div>
          ))}
        </div>,
        place.root,
      )}
    </span>
  );
}
