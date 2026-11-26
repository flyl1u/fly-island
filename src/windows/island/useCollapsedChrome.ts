import { useLayoutEffect, useState } from "react";
import { createCollapsedTextMeasure } from "./collapsedTextMeasure";
import { collapsedChromeWidth, type MeasureCollapsedText } from "./collapsedWidth";

type CollapsedChrome = { width: number; measure?: MeasureCollapsedText };
const NONE: CollapsedChrome = { width: 0 };

/**
 * For the automatic width: how much of the collapsed bar is not its text (collapsedChromeWidth),
 * and how to measure the text in the bar's font (`fontKey` names the chosen font). Only what keeps
 * its own width whatever the island's is read: the status slots, the side space and the update dot.
 * The song's cover is left to the caller, which knows it before it is drawn.
 */
export function useCollapsedChrome(enabled: boolean, fontScale: number, fontKey: string) {
  const [chrome, setChrome] = useState(NONE);
  useLayoutEffect(() => {
    if (!enabled) return;
    const bar = document.querySelector<HTMLElement>(".island__collapsed:not(.island__collapsed--notice)");
    if (!bar) return;
    let frame = 0;
    let measured = "";
    let measureText: MeasureCollapsedText | undefined;
    const outerWidth = (node: HTMLElement) => {
      const style = getComputedStyle(node);
      return node.offsetWidth + parseFloat(style.marginLeft || "0") + parseFloat(style.marginRight || "0");
    };
    const measure = (fontsChanged = false) => {
      const style = getComputedStyle(bar);
      const status = [...bar.children].filter((node): node is HTMLElement => node instanceof HTMLElement
        && node.dataset.collapsedPresence !== "leaving" && !node.classList.contains("island__text-slot"));
      const dot = bar.querySelector<HTMLElement>(".island__open-button > .island-update-dot");
      const width = Math.ceil(collapsedChromeWidth({
        status: status.map(outerWidth),
        gap: parseFloat(style.columnGap || "0"),
        padding: parseFloat(style.paddingLeft) + parseFloat(style.paddingRight),
        textExtras: dot ? outerWidth(dot) + parseFloat(getComputedStyle(dot.parentElement!).columnGap || "0") : 0,
      }));
      const pixelFont = bar.closest(".stage--font-pixel") !== null;
      const key = `${width}\u001f${style.fontFamily}\u001f${pixelFont}`;
      if (key === measured && !fontsChanged) return;
      measured = key;
      measureText = createCollapsedTextMeasure(style.fontFamily, pixelFont, fontScale);
      setChrome({ width, measure: measureText });
    };
    const schedule = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(() => measure()); };
    const sizes = new ResizeObserver(schedule);
    const observe = () => {
      sizes.disconnect();
      for (const child of bar.children) if (!child.classList.contains("island__text-slot")) sizes.observe(child);
      schedule();
    };
    const children = new MutationObserver((records) => {
      if (records.some(({ target }) => target === bar || (target as Element).parentElement === bar)) observe();
      else schedule();
    });
    children.observe(bar, { childList: true, subtree: true, attributes: true, attributeFilter: ["data-collapsed-presence"] });
    // A font that arrives late changes what the text measures.
    const fontsLoaded = () => measure(true);
    document.fonts.addEventListener("loadingdone", fontsLoaded);
    // Before the first paint, so the island is never drawn at a width without its contents.
    measure();
    observe();
    return () => {
      cancelAnimationFrame(frame); sizes.disconnect(); children.disconnect();
      document.fonts.removeEventListener("loadingdone", fontsLoaded);
    };
  }, [enabled, fontScale, fontKey]);
  return enabled ? chrome : NONE;
}
