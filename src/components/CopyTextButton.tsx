import { useEffect, useRef, useState, type PointerEvent } from "react";
import { Check, Copy } from "lucide-react";
import { useTranslation } from "../i18n";
import { copyText } from "../lib/copyText";
import "./CopyTextButton.css";

/**
 * Copies `text` (asked for on click, so it is read fresh) and says so for a moment. `compact`
 * shows only the icon, with the label as its name; otherwise the icon and the label.
 */
export function CopyTextButton({ text, compact = false, disabled = false, className = "" }: { text: () => string; compact?: boolean; disabled?: boolean; className?: string }) {
  const t = useTranslation();
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  const label = state === "copied" ? t.common.textCopied : state === "failed" ? t.common.copyFailed : t.common.copyText;
  return (
    <button
      className={`copy-text-button${compact ? " copy-text-button--compact" : ""}${state === "copied" ? " copy-text-button--copied" : ""} ${className}`.trim()}
      type="button"
      disabled={disabled}
      aria-label={compact ? label : undefined}
      title={compact ? label : undefined}
      // Inside a draggable bar: a press here copies, it never starts moving the window.
      onPointerDown={(event: PointerEvent) => event.stopPropagation()}
      onClick={(event) => {
        event.stopPropagation();
        window.clearTimeout(timer.current);
        void copyText(text()).then((copied) => {
          setState(copied ? "copied" : "failed");
          timer.current = window.setTimeout(() => setState("idle"), 1_500);
        });
      }}
    >
      {state === "copied" ? <Check size={14} strokeWidth={1.8} aria-hidden="true" /> : <Copy size={14} strokeWidth={1.8} aria-hidden="true" />}
      {!compact && <span aria-live="polite">{label}</span>}
    </button>
  );
}
