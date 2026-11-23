import { useLayoutEffect, useState, type CSSProperties, type RefObject } from "react";
import {
  getPageButtonLabelWidths, PAGE_BUTTON_ICON_SIZE, PAGE_BUTTON_LABEL_SPACING,
  resolvePageButtonLabelMode, type PageButtonLabelMode, type PageButtonWidths,
} from "./pageButtonLabels";

const ICON = ".page-button-content__icon";
const MEASURE = ".page-button-content__measure > span";
const FIXED = "[data-page-button-fixed]";

function layoutWidth(element: Element) {
  // The island and its preview are scaled with transforms. Read layout pixels.
  return parseFloat(getComputedStyle(element).width);
}

export function usePageButtonLabels(rowRef: RefObject<HTMLElement | null>, enabled: boolean, currentPage: string) {
  const [mode, setMode] = useState<PageButtonLabelMode | null>(null);

  useLayoutEffect(() => {
    if (!enabled) {
      setMode(null);
      return;
    }
    const row = rowRef.current;
    if (!row) return;

    const measure = () => {
      const available = layoutWidth(row);
      if (!(available > 0)) return;

      const buttons: PageButtonWidths[] = [];
      for (const button of row.querySelectorAll<HTMLElement>("[data-page-button]")) {
        const page = button.dataset.pageButton;
        const icon = button.querySelector(ICON);
        const [full, small] = button.querySelectorAll(MEASURE);
        if (!page || !icon || !full || !small) continue;
        buttons.push({
          page,
          iconWidth: layoutWidth(icon),
          fullTextWidth: layoutWidth(full),
          smallTextWidth: layoutWidth(small),
        });
      }
      if (!buttons.length) return;

      const fixed = [...row.querySelectorAll(FIXED)].map(layoutWidth);
      const unit = buttons[0].iconWidth / PAGE_BUTTON_ICON_SIZE;
      const widths = getPageButtonLabelWidths(buttons, fixed, currentPage, unit);
      // The scaled drawing can round its individual gaps and padding to different fractions of a pixel.
      const usableWidth = unit === 1 ? available : available - 0.25;
      setMode((previous) => resolvePageButtonLabelMode(usableWidth, widths, previous, unit));
    };

    // Observe sizes that stay the same across modes, including the two intrinsic text sizes.
    const sizes = new ResizeObserver(measure);
    const observe = () => {
      sizes.disconnect();
      sizes.observe(row);
      for (const item of row.querySelectorAll(`${ICON}, ${MEASURE}, ${FIXED}`)) sizes.observe(item);
      measure();
    };
    const children = new MutationObserver(observe);
    children.observe(row, { childList: true });
    observe();

    return () => {
      sizes.disconnect();
      children.disconnect();
    };
  }, [rowRef, enabled, currentPage]);

  if (!enabled) return undefined;

  const layout = mode ?? "all";
  const { padding, rowGap, iconGap } = PAGE_BUTTON_LABEL_SPACING[layout];
  return {
    "data-page-label-mode": layout,
    style: {
      "--page-button-icon-size": PAGE_BUTTON_ICON_SIZE,
      "--page-button-padding": padding,
      "--page-button-spacing": rowGap,
      "--page-button-icon-gap": iconGap,
    } as CSSProperties,
  };
}
