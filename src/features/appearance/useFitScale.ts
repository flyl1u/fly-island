import { useLayoutEffect, useState, type RefObject } from "react";

/**
 * How much a drawing laid out at its natural width must shrink to fit its container (never above
 * 1). `scale` is what the drawing is already scaled by. It reads layout widths, which a transform
 * does not change, so applying the result as a transform cannot feed back into it.
 */
export function useFitScale(containerRef: RefObject<HTMLElement | null>, selector: string, scale: number) {
  const [fit, setFit] = useState(1);
  useLayoutEffect(() => {
    const container = containerRef.current;
    const drawing = container?.querySelector<HTMLElement>(selector);
    if (!container || !drawing) return;
    const measure = () => {
      const style = getComputedStyle(container);
      const room = container.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
      const width = drawing.offsetWidth * scale;
      setFit(width > 0 && room > 0 ? Math.min(1, room / width) : 1);
    };
    measure();
    const sizes = new ResizeObserver(measure);
    sizes.observe(container);
    sizes.observe(drawing);
    return () => sizes.disconnect();
  }, [containerRef, selector, scale]);
  return fit;
}
