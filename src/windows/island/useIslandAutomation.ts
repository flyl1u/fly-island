import { useEffect, useState } from "react";

export function useTodoRotation(
  todoIds: string[],
  activeTodoId: string | null,
  enabled: boolean,
  seconds: number,
  paused: boolean,
) {
  const [rotatingId, setRotatingId] = useState<string | null>(activeTodoId);
  const displayedId = rotatingId && todoIds.includes(rotatingId)
    ? rotatingId
    : activeTodoId && todoIds.includes(activeTodoId)
      ? activeTodoId
      : todoIds[0] ?? null;

  useEffect(() => {
    setRotatingId(activeTodoId);
  }, [activeTodoId, enabled]);

  useEffect(() => {
    if (!enabled || paused || todoIds.length < 2) return;
    const timer = window.setTimeout(() => {
      const index = displayedId ? todoIds.indexOf(displayedId) : -1;
      setRotatingId(todoIds[(index + 1) % todoIds.length]);
    }, seconds * 1_000);
    return () => window.clearTimeout(timer);
  }, [displayedId, enabled, paused, seconds, todoIds]);

  return enabled ? displayedId : activeTodoId;
}

export function useIdleTuck(
  enabled: boolean,
  seconds: number,
  isTucked: boolean,
  view: string,
  onTuck: () => void,
) {
  useEffect(() => {
    if (!enabled || isTucked) return;
    let timer: number | undefined;
    let pointerDown = false;
    let composing = false;
    const reset = () => {
      window.clearTimeout(timer);
      if (!pointerDown && !composing && !document.hidden) {
        timer = window.setTimeout(onTuck, seconds * 1_000);
      }
    };
    const startPointer = () => { pointerDown = true; reset(); };
    const endPointer = () => { pointerDown = false; reset(); };
    const startComposition = () => { composing = true; reset(); };
    const endComposition = () => { composing = false; reset(); };
    const blur = () => { pointerDown = false; composing = false; reset(); };
    const events = ["pointermove", "keydown", "wheel", "input", "focusin", "focus", "visibilitychange"];
    events.forEach((event) => window.addEventListener(event, reset, true));
    window.addEventListener("pointerdown", startPointer, true);
    window.addEventListener("pointerup", endPointer, true);
    window.addEventListener("pointercancel", endPointer, true);
    window.addEventListener("compositionstart", startComposition, true);
    window.addEventListener("compositionend", endComposition, true);
    window.addEventListener("blur", blur);
    reset();
    return () => {
      window.clearTimeout(timer);
      events.forEach((event) => window.removeEventListener(event, reset, true));
      window.removeEventListener("pointerdown", startPointer, true);
      window.removeEventListener("pointerup", endPointer, true);
      window.removeEventListener("pointercancel", endPointer, true);
      window.removeEventListener("compositionstart", startComposition, true);
      window.removeEventListener("compositionend", endComposition, true);
      window.removeEventListener("blur", blur);
    };
  }, [enabled, isTucked, onTuck, seconds, view]);
}

/** Slides a tucked island back into view when a message preview starts showing on it. */
export function useRevealOnMessage(hasPreview: boolean, isTucked: boolean, onReveal: () => void) {
  useEffect(() => {
    if (hasPreview && isTucked) onReveal();
  }, [hasPreview, isTucked, onReveal]);
}
