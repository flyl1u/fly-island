import { useLayoutEffect, useState } from "react";

/** Measure status siblings only, leaving a small readable text area at manual widths too. */
export function useCollapsedStatusWidth(enabled: boolean, fontScale: number) {
  const [minimum, setMinimum] = useState(0);
  useLayoutEffect(() => {
    if (!enabled) return;
    const bar = document.querySelector<HTMLElement>(".island__collapsed:not(.island__collapsed--notice)");
    if (!bar) return;
    let frame = 0;
    const measure = () => {
      const children = [...bar.children].filter((node): node is HTMLElement => node instanceof HTMLElement);
      const status = children.filter((node) => !node.classList.contains("island__text-slot"));
      const style = getComputedStyle(bar);
      const widths = status.reduce((total, node) => {
        const item = getComputedStyle(node);
        return total + node.offsetWidth + parseFloat(item.marginLeft || "0") + parseFloat(item.marginRight || "0");
      }, 0);
      const width = Math.ceil(widths + Math.max(0, children.length - 1) * parseFloat(style.columnGap || "0")
        + parseFloat(style.paddingLeft) + parseFloat(style.paddingRight) + 64 * fontScale);
      setMinimum((previous) => previous === width ? previous : width);
    };
    const schedule = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(measure); };
    const sizes = new ResizeObserver(schedule);
    const observe = () => {
      sizes.disconnect();
      for (const child of bar.children) if (!child.classList.contains("island__text-slot")) sizes.observe(child);
      schedule();
    };
    const children = new MutationObserver(observe);
    children.observe(bar, { childList: true });
    observe();
    return () => { cancelAnimationFrame(frame); sizes.disconnect(); children.disconnect(); };
  }, [enabled, fontScale]);
  return enabled ? minimum : 0;
}
