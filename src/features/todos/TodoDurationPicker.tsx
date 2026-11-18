import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";
import { createPortal } from "react-dom";
import { Bell, Play } from "lucide-react";
import { NumberStepper } from "../../components/NumberStepper";
import { useTranslation } from "../../i18n";
import { MAX_REMIND_MINUTES, MAX_TODO_MINUTES, MIN_TODO_MINUTES } from "./timer";
import { loadTodoRemindMinutes, saveTodoRemindMinutes } from "./storage";
import "./TodoDurationPicker.css";

const GAP = 6;
const EDGE = 6;

/**
 * A small setter floating above the watch button. Drawn into the stage rather than the todo
 * row, so the scrolling list cannot clip it; it drops below the button only when there is no
 * room above. Each change is kept at once, so Start uses it even if this closes first.
 */
export function TodoDurationPicker({ anchor, minutes, reminder = false, onChange, onStart, onClose }: {
  anchor: RefObject<HTMLButtonElement | null>;
  minutes: number;
  /** Also ask how many minutes before the end to remind (0: no reminder); the last choice is kept. */
  reminder?: boolean;
  onChange: (minutes: number) => void;
  onStart: (minutes: number, remindMinutes: number) => void;
  onClose: (refocus: boolean) => void;
}) {
  const t = useTranslation();
  const card = useRef<HTMLFormElement>(null);
  const startButton = useRef<HTMLButtonElement>(null);
  const [place, setPlace] = useState<{ top: number; left: number; below: boolean } | null>(null);
  const [remindChoice, setRemindChoice] = useState(loadTodoRemindMinutes);
  // Always shorter than the round: a 5-minute round can be reminded at most 4 minutes before.
  const remindLimit = Math.max(0, Math.min(MAX_REMIND_MINUTES, minutes - 1));
  const remindMinutes = reminder ? Math.min(remindChoice, remindLimit) : 0;
  const start = () => {
    if (reminder) saveTodoRemindMinutes(remindMinutes);
    onStart(minutes, remindMinutes);
  };
  const root = anchor.current?.closest(".stage") ?? document.body;
  const close = useRef(onClose);
  close.current = onClose;
  // Where the watch was when the card was placed, to tell a real scroll from a layout one.
  const placedAt = useRef<{ top: number; left: number } | null>(null);

  useLayoutEffect(() => {
    const button = anchor.current;
    const box = card.current;
    if (!button || !box) return;
    const rect = button.getBoundingClientRect();
    placedAt.current = { top: rect.top, left: rect.left };
    const size = box.getBoundingClientRect();
    const below = rect.top - GAP - size.height < EDGE;
    const island = button.closest(".island")?.getBoundingClientRect();
    const minLeft = Math.max(EDGE, (island?.left ?? 0) + EDGE);
    const maxLeft = Math.min(window.innerWidth, island?.right ?? window.innerWidth) - size.width - EDGE;
    const left = Math.max(minLeft, Math.min(rect.left + rect.width / 2 - size.width / 2, maxLeft));
    setPlace({ top: below ? rect.bottom + GAP : rect.top - GAP - size.height, left, below });
  }, [anchor, reminder, remindMinutes]);

  useEffect(() => startButton.current?.focus(), []);

  // Outside clicks and a scrolling list close it; the list would leave it pointing at nothing.
  // Only a scroll that moved the watch counts: scroll events arrive a frame late, and the list
  // clamping its position after a layout change would otherwise close a card just opened.
  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!card.current?.contains(target) && !anchor.current?.contains(target)) close.current(false);
    };
    const onScroll = (event: Event) => {
      if (card.current?.contains(event.target as Node)) return;
      const rect = anchor.current?.getBoundingClientRect();
      const placed = placedAt.current;
      if (!rect || !placed || Math.abs(rect.top - placed.top) > 1 || Math.abs(rect.left - placed.left) > 1) close.current(false);
    };
    // It lives outside the island, so it has to go when the island collapses or tucks.
    const island = anchor.current?.closest(".island");
    const collapse = new MutationObserver(() => {
      if (!island?.classList.contains("island--expanded")) close.current(false);
    });
    if (island) collapse.observe(island, { attributes: true, attributeFilter: ["class"] });
    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("scroll", onScroll, true);
    return () => {
      collapse.disconnect();
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("scroll", onScroll, true);
    };
  }, [anchor]);

  return createPortal(
    <form
      ref={card}
      className={place?.below ? "todo-duration-picker todo-duration-picker--below" : "todo-duration-picker"}
      role="dialog"
      aria-label={t.todo.chooseDuration}
      style={{ top: place?.top ?? 0, left: place?.left ?? 0, visibility: place ? undefined : "hidden" }}
      onSubmit={(event) => { event.preventDefault(); start(); }}
      onKeyDown={(event) => {
        if (event.key === "Escape") { event.stopPropagation(); onClose(true); }
      }}
    >
      <NumberStepper variant="island" min={MIN_TODO_MINUTES} max={MAX_TODO_MINUTES} step={5}
        value={minutes} ariaLabel={t.todo.chooseDuration} onChange={onChange} />
      <span className="todo-duration-picker__unit">{t.todo.minutesUnit}</span>
      {reminder && remindLimit > 0 && <span className="todo-duration-picker__remind" title={t.todo.remindHint}>
        <Bell size={12} strokeWidth={2.2} aria-hidden="true" />
        <NumberStepper variant="island" min={0} max={remindLimit} step={1}
          value={remindMinutes} ariaLabel={t.todo.remindBefore} onChange={setRemindChoice} />
        <span className="todo-duration-picker__unit">{remindMinutes > 0 ? t.todo.remindUnit : t.todo.remindOff}</span>
      </span>}
      <button ref={startButton} className="todo-duration-picker__start" type="submit" aria-label={t.todo.startFor(minutes)}>
        <Play size={12} strokeWidth={2.6} />
      </button>
    </form>,
    root,
  );
}
