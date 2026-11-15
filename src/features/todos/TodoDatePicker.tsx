import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { CalendarDays } from "lucide-react";
import { useTranslation } from "../../i18n";
import { addDays } from "./schedule";
import { holdIslandPicker } from "../../lib/islandPicker";
import { TodoDatePopover } from "./TodoDatePopover";
import "./TodoDatePicker.css";

/** Picks the day a new todo is for; a later day schedules it instead of adding it now. */
export function TodoDatePicker({
  value,
  today,
  disabled,
  onChange,
}: {
  /** Chosen day (YYYY-MM-DD), or null for the list's own day. */
  value: string | null;
  today: string;
  disabled: boolean;
  onChange: (date: string | null) => void;
}) {
  const t = useTranslation();
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const wrapperRef = useRef<HTMLSpanElement>(null);
  const id = useId();
  const showing = open && !disabled;
  const isLater = value !== null && value > today;
  const label = !isLater
    ? t.notebook.dateToday
    : value === addDays(today, 1)
      ? t.notebook.dateTomorrow
      : new Intl.DateTimeFormat(t.localeTag, { month: "numeric", day: "numeric" }).format(
          new Date(`${value}T00:00:00`),
        );

  useLayoutEffect(() => showing ? holdIslandPicker() : undefined, [showing]);
  useEffect(() => {
    if (!showing) return;
    const outside = (event: PointerEvent | FocusEvent) => {
      if (!wrapperRef.current?.contains(event.target as Node)) setOpen(false);
    };
    // The todo page stays mounted while collapsed; release its lock when it becomes hidden.
    const island = wrapperRef.current?.closest(".island");
    const observer = new MutationObserver(() => {
      if (!island?.classList.contains("island--expanded")) setOpen(false);
    });
    if (island) observer.observe(island, { attributes: true, attributeFilter: ["class"] });
    const blur = () => setOpen(false);
    document.addEventListener("pointerdown", outside, true);
    document.addEventListener("focusin", outside, true);
    window.addEventListener("blur", blur);
    return () => {
      observer.disconnect();
      document.removeEventListener("pointerdown", outside, true);
      document.removeEventListener("focusin", outside, true);
      window.removeEventListener("blur", blur);
    };
  }, [showing]);
  const close = () => { setOpen(false); buttonRef.current?.focus({ preventScroll: true }); };

  return (
    <span ref={wrapperRef} className="todo-date-picker">
      <button
        ref={buttonRef}
        className={`todo-date-picker__button${isLater ? " todo-date-picker__button--later" : ""}`}
        type="button"
        disabled={disabled}
        aria-label={`${t.notebook.pickDate}: ${label}`}
        aria-haspopup="dialog"
        aria-expanded={showing}
        aria-controls={showing ? id : undefined}
        onClick={() => setOpen(!showing)}
      >
        <CalendarDays size={13} strokeWidth={2.2} aria-hidden="true" />
        <span>{label}</span>
      </button>
      {showing && <TodoDatePopover id={id} value={value} today={today} onSelect={onChange} onClose={close} />}
    </span>
  );
}
