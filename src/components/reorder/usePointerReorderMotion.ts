import { useLayoutEffect, useRef, type RefObject } from "react";

type Drag = { element: HTMLElement; start: number; at: number; offset: number; scale: number };
const DURATION = 180;

/** Opt-in FLIP motion for direct children of a positioned reorder container. */
export function usePointerReorderMotion(
  items: readonly string[], axis: "x" | "y", enabled: boolean,
  container: RefObject<HTMLElement | null>,
) {
  const drag = useRef<Drag | null>(null);
  const before = useRef(new Map<HTMLElement, DOMRect>());
  const animations = useRef(new Map<HTMLElement, Animation>());
  const elements = () => [...(container.current?.querySelectorAll<HTMLElement>("[data-reorder-id]") ?? [])];
  const animate = (element: HTMLElement, from: string) => {
    animations.current.get(element)?.cancel();
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const animation = element.animate([{ translate: from }, { translate: "0px 0px" }], {
      duration: DURATION, easing: "cubic-bezier(.2,.8,.2,1)",
    });
    animations.current.set(element, animation);
    animation.onfinish = () => { if (animations.current.get(element) === animation) animations.current.delete(element); };
  };
  const follow = () => {
    const current = drag.current;
    if (!current) return;
    const offset = axis === "x" ? current.element.offsetLeft : current.element.offsetTop;
    const delta = current.offset + (current.at - current.start) / current.scale - offset;
    current.element.style.translate = axis === "x" ? `${delta}px 0px` : `0px ${delta}px`;
  };

  useLayoutEffect(() => {
    if (!enabled) return;
    const first = before.current;
    const running = animations.current;
    const current = drag.current;
    for (const element of container.current?.querySelectorAll<HTMLElement>("[data-reorder-id]") ?? []) {
      const old = first.get(element);
      if (!old || element === current?.element) continue;
      running.get(element)?.cancel();
      const rect = element.getBoundingClientRect();
      const scale = rect.width / element.offsetWidth || 1;
      const delta = axis === "x" ? old.left - rect.left : old.top - rect.top;
      if (Math.abs(delta) > 0.5 && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        const animation = element.animate([
          { translate: axis === "x" ? `${delta / scale}px 0px` : `0px ${delta / scale}px` },
          { translate: "0px 0px" },
        ], { duration: DURATION, easing: "cubic-bezier(.2,.8,.2,1)" });
        running.set(element, animation);
      }
    }
    first.clear();
    if (current) {
      const offset = axis === "x" ? current.element.offsetLeft : current.element.offsetTop;
      const delta = current.offset + (current.at - current.start) / current.scale - offset;
      current.element.style.translate = axis === "x" ? `${delta}px 0px` : `0px ${delta}px`;
    }
  }, [axis, container, enabled, items]);

  useLayoutEffect(() => {
    const running = animations.current;
    return () => {
      running.forEach((animation) => animation.cancel());
      running.clear();
      drag.current?.element.style.removeProperty("translate");
      drag.current = null;
    };
  }, []);

  return {
    start(element: HTMLElement, at: number) {
      if (!enabled) return;
      animations.current.get(element)?.cancel();
      drag.current = {
        element, start: at, at, offset: axis === "x" ? element.offsetLeft : element.offsetTop,
        scale: element.getBoundingClientRect().width / element.offsetWidth || 1,
      };
    },
    move(at: number) {
      if (drag.current) { drag.current.at = at; follow(); }
    },
    capture() {
      if (enabled) before.current = new Map(elements().map((element) => [element, element.getBoundingClientRect()]));
    },
    target(at: number) {
      const parent = container.current;
      if (!parent) return;
      const rect = parent.getBoundingClientRect();
      const scale = rect.width / parent.offsetWidth || 1;
      const local = (at - (axis === "x" ? rect.left : rect.top)) / scale;
      const current = drag.current?.element;
      const currentIndex = elements().indexOf(current!);
      const candidates = elements();
      const passed = (element: HTMLElement) => {
        const start = axis === "x" ? element.offsetLeft : element.offsetTop;
        const size = axis === "x" ? element.offsetWidth : element.offsetHeight;
        return start + size / 2;
      };
      return (candidates.find((element, index) => index < currentIndex && local < passed(element))
        ?? [...candidates].reverse().find((element) => candidates.indexOf(element) > currentIndex && local > passed(element)))?.dataset.reorderId;
    },
    finish() {
      const current = drag.current;
      if (!current) return;
      const from = current.element.style.translate;
      current.element.style.removeProperty("translate");
      drag.current = null;
      animate(current.element, from);
    },
  };
}
