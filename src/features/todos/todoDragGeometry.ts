/** 去掉跟手和 FLIP 变换，命中检测始终使用布局位置。 */
export function todoLayoutTop(element: HTMLElement): number {
  const rect = element.getBoundingClientRect();
  const transform = getComputedStyle(element).transform;
  const y = transform === "none" ? 0 : new DOMMatrixReadOnly(transform).m42;
  return rect.top - y + (rect.height - element.offsetHeight) / 2;
}

export function todoScrollContainer(element: HTMLElement): HTMLElement | null {
  for (let parent = element.parentElement; parent; parent = parent.parentElement) {
    if (/(auto|scroll)/.test(getComputedStyle(parent).overflowY)) return parent;
  }
  return null;
}

export const todoMotionOptions = { duration: 200, easing: "cubic-bezier(0.2,0.8,0.2,1)" };
export const todoReducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;
