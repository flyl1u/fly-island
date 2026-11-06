import { useCallback, useEffect, useState } from "react";

/** Within this many pixels of an end, the list counts as being at that end. */
const EDGE_PX = 2;

/**
 * Which ends of a scrolling element have more content past them, so the page can fade those
 * ends out. Updates on scroll, when the element is resized (the island changing height) and
 * when `contentKey` changes (rows added, removed or growing). `ref` is a callback ref, so an
 * element that appears later (after an empty state) is picked up too.
 */
export function useScrollFade<T extends HTMLElement>(contentKey: unknown) {
  const [element, setElement] = useState<T | null>(null);
  const [fade, setFade] = useState({ top: false, bottom: false });

  const update = useCallback(() => {
    if (!element) return;
    const top = element.scrollTop > EDGE_PX;
    const bottom = element.scrollHeight - element.clientHeight - element.scrollTop > EDGE_PX;
    setFade((current) => (current.top === top && current.bottom === bottom ? current : { top, bottom }));
  }, [element]);

  useEffect(() => {
    if (!element) return;
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, [element, update]);

  useEffect(update, [update, contentKey]);

  return { ref: setElement, fade, onScroll: update };
}
