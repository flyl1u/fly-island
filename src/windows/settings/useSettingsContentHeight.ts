import { useLayoutEffect, useRef, type RefObject } from "react";

/**
 * The height an element's content needs, scrolled or not: its last child's bottom plus padding.
 * The element must be positioned, so its children's offsetTop is measured from it.
 */
function contentHeight(element: HTMLElement) {
  const last = element.lastElementChild as HTMLElement | null;
  const padding = Number.parseFloat(getComputedStyle(element).paddingBottom) || 0;
  return last ? last.offsetTop + last.offsetHeight + padding : element.clientHeight;
}

/**
 * Reports the height the settings layout needs to show the open page without scrolling: the
 * taller of the page (title and groups) and the page list. The island sizes its settings page to
 * it (useSettingsPageHeight); the standalone window ignores it. Re-measured whenever the page or
 * the list changes size, e.g. a switch reveals the rows under it.
 */
export function useSettingsContentHeight(
  layoutRef: RefObject<HTMLElement | null>,
  pageKey: string,
  onHeight: ((height: number) => void) | undefined,
) {
  const reported = useRef(0);

  useLayoutEffect(() => {
    const layout = layoutRef.current;
    if (!layout || !onHeight) return;
    const page = layout.querySelector<HTMLElement>(".editor-panel");
    const nav = layout.querySelector<HTMLElement>(".settings-sidebar");
    if (!page || !nav) return;
    const list = nav.querySelector<HTMLElement>(".settings-sidebar__list");
    const footer = nav.querySelector<HTMLElement>(".settings-sidebar__footer");
    const measure = () => {
      // The list fills the column it is given, so its own height says nothing; its content does.
      const navStyle = getComputedStyle(nav);
      const footerHeight = footer ? footer.offsetHeight + (Number.parseFloat(getComputedStyle(footer).marginTop) || 0) : 0;
      const navHeight = (list ? contentHeight(list) : 0) + footerHeight +
        (Number.parseFloat(navStyle.paddingTop) || 0) + (Number.parseFloat(navStyle.paddingBottom) || 0);
      const height = Math.ceil(Math.max(contentHeight(page), navHeight));
      if (height !== reported.current) {
        reported.current = height;
        onHeight(height);
      }
    };
    measure();
    const observer = new ResizeObserver(measure);
    for (const child of page.children) observer.observe(child);
    if (list) for (const child of list.children) observer.observe(child);
    return () => observer.disconnect();
  }, [layoutRef, pageKey, onHeight]);
}
