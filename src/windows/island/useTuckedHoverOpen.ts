import { useCallback, useEffect, useRef } from "react";
import { listenIslandHover } from "./api";

// The tucked island sits on the screen's top edge, where the cursor often passes on
// its way to tabs and menus: it normally slides out at once, but opens only if the cursor stays.
// Browser auto-tuck can add a dwell before it slides out, so a brief pass never reveals it.
// It opens no sooner than the slide-out ends (POSITION_ANIMATION_DURATION in
// src-tauri/src/island/geometry.rs), so the two play one after the other.
const MIN_OPEN_DELAY_MS = 320;

type TuckedHoverOptions = {
  /** Hovering a tucked island opens its panel (expand trigger "hover", see tuckedHover.ts); otherwise it only slides out. */
  opensPanel: boolean;
  delayMs: number;
  /** Extra pointer dwell before a browser-tucked island slides out. */
  hoverDwellDelayMs?: number;
  /** While a browser is foregrounded, a click is required instead of pointer dwell. */
  clickToOpen?: boolean;
  /**
   * The island is out only for the cursor (collapsed, sliding back once it leaves).
   * A cursor that comes back before it has slid back opens the panel too.
   */
  isPeeking: boolean;
  /** Slides the island out under the cursor (useIslandNavigation's peekIsland). */
  onPeek: () => void;
  /** Opens the current page. */
  onOpen: () => void;
  /** Game mode: the cursor on a tucked island does nothing at all. */
  blocked: boolean;
  /** The island was tucked so that it slides back once the cursor leaves. */
  retractsAfterPeek: boolean;
  /** Keeps that after opening, so the panel closes and the island slides back with it. */
  resumePeek: () => void;
};

/** What the cursor arriving on a tucked island does; returns the handler for that moment. */
export function useTuckedHoverOpen(options: TuckedHoverOptions) {
  // The hover listener lives as long as the island; it reads the latest options.
  const optionsRef = useRef(options);
  optionsRef.current = options;
  const hoveringRef = useRef(false);
  const dwellTimerRef = useRef<number | undefined>(undefined);
  const openTimerRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    window.clearTimeout(dwellTimerRef.current);
    window.clearTimeout(openTimerRef.current);
  }, [options.clickToOpen, options.hoverDwellDelayMs]);

  const scheduleOpen = useCallback((forceOpen = false) => {
    window.clearTimeout(openTimerRef.current);
    if (!forceOpen && !optionsRef.current.opensPanel) return;
    openTimerRef.current = window.setTimeout(() => {
      // The page sees the cursor before the native hover event arrives.
      if (!forceOpen && !hoveringRef.current && !document.querySelector(".island:hover")) return;
      const { onOpen, retractsAfterPeek, resumePeek } = optionsRef.current;
      onOpen();
      if (retractsAfterPeek) resumePeek();
    }, Math.max(optionsRef.current.delayMs, MIN_OPEN_DELAY_MS));
  }, []);

  useEffect(() => {
    let didCancel = false;
    let unlisten: (() => void) | null = null;
    void listenIslandHover((inside) => {
      hoveringRef.current = inside;
      if (!inside) {
        window.clearTimeout(dwellTimerRef.current);
        window.clearTimeout(openTimerRef.current);
      }
      // Back on an island that has not slid away yet: it will not get a tucked mouse-enter.
      else if (optionsRef.current.isPeeking && !optionsRef.current.clickToOpen) scheduleOpen();
    })
      .then((next) => {
        if (didCancel) next();
        else unlisten = next;
      })
      .catch((error) => console.error("Failed to listen for island hover", error));
    return () => {
      didCancel = true;
      unlisten?.();
      window.clearTimeout(dwellTimerRef.current);
      window.clearTimeout(openTimerRef.current);
    };
  }, [scheduleOpen]);

  const handleHover = useCallback(() => {
    if (optionsRef.current.blocked) return;
    if (optionsRef.current.clickToOpen) return;
    window.clearTimeout(dwellTimerRef.current);
    const delay = optionsRef.current.hoverDwellDelayMs ?? 0;
    const reveal = () => {
      if (optionsRef.current.blocked) return;
      if (delay > 0 && !hoveringRef.current && !document.querySelector(".island:hover")) return;
      optionsRef.current.onPeek();
      scheduleOpen();
    };
    if (delay <= 0) reveal();
    else dwellTimerRef.current = window.setTimeout(reveal, delay);
  }, [scheduleOpen]);

  const handleClick = useCallback(() => {
    if (optionsRef.current.blocked || !optionsRef.current.clickToOpen) return;
    window.clearTimeout(dwellTimerRef.current);
    window.clearTimeout(openTimerRef.current);
    optionsRef.current.onPeek();
    scheduleOpen(true);
  }, [scheduleOpen]);

  return { handleHover, handleClick };
}
