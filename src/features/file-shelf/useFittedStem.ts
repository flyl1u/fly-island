import { useLayoutEffect, useRef, useState } from "react";
import { fitFileStem } from "./fileShelf.ts";

/**
 * The part of a file name's stem that fits beside its extension in the name's box, measured with
 * the name's own font and kept up to date as the box resizes. Until measured (and where a canvas
 * is unavailable) the whole stem shows and CSS ends it with an ellipsis.
 */
export function useFittedStem(stem: string, extension: string) {
  const ref = useRef<HTMLSpanElement>(null);
  const [shown, setShown] = useState(stem);

  useLayoutEffect(() => {
    const name = ref.current;
    const box = name?.parentElement;
    const context = document.createElement("canvas").getContext("2d");
    if (!name || !box || !context) {
      setShown(stem);
      return;
    }
    const fit = () => {
      const style = getComputedStyle(name);
      context.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
      // A pixel to spare, so rounding never pushes the extension out.
      setShown(fitFileStem(stem, extension, box.clientWidth - 1, (text) => context.measureText(text).width));
    };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(box);
    return () => observer.disconnect();
  }, [extension, stem]);

  return { ref, shown };
}
