import { useLayoutEffect, useRef } from "react";
import "./ScreenshotTextLine.css";

/** Grow with wrapped content and pane width; text never shares a fixed source-image box. */
export function ScreenshotTextLine({ value, ariaLabel, onChange, onFocus, disabled = false, fontSize = 16, lineId, className = "" }: {
  value: string; ariaLabel: string; onChange: (value: string) => void; onFocus?: () => void;
  disabled?: boolean; fontSize?: number; lineId?: number; className?: string;
}) {
  const ref = useRef<HTMLTextAreaElement | null>(null);
  const resize = () => {
    const input = ref.current;
    if (!input) return;
    input.style.height = "0px";
    input.style.height = `${input.scrollHeight + 2}px`;
  };
  useLayoutEffect(resize, [value, fontSize]);
  useLayoutEffect(() => {
    const input = ref.current;
    if (!input) return;
    let width = -1;
    const observer = new ResizeObserver(([entry]) => {
      if (entry.contentRect.width === width) return;
      width = entry.contentRect.width; resize();
    });
    observer.observe(input);
    return () => observer.disconnect();
  }, []);
  return <textarea ref={ref} className={`screenshot-result-input ${className}`} rows={1} value={value}
    data-ocr-line={lineId} aria-label={ariaLabel} disabled={disabled} spellCheck={false}
    style={{ fontSize, lineHeight: 1.6 }} onFocus={onFocus} onChange={(event) => onChange(event.target.value)} />;
}
