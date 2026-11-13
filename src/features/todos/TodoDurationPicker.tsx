import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";
import { createPortal } from "react-dom";
import { Play } from "lucide-react";
import { NumberStepper } from "../../components/NumberStepper";
import { useTranslation } from "../../i18n";
import { MAX_TODO_MINUTES, MIN_TODO_MINUTES } from "./timer";
import "./TodoDurationPicker.css";

const GAP = 6;
const EDGE = 6;

/**
 * A small setter floating above the watch button. Drawn into the stage rather than the todo
 * row, so the scrolling list cannot clip it; it drops below the button only when there is no
 * room above. Each change is kept at once, so Start uses it even if this closes first.
 */
export function TodoDurationPicker({ anchor, minutes, onChange, onStart, onClose }: {
  anchor: RefObject<HTMLButtonElement | null>;
  minutes: number;
  onChange: (minutes: number) => void;
  onStart: (minutes: number) => void;
  onClose: (refocus: boolean) => void;
}) {
  const t = useTranslation();
  const card = useRef<HTMLFormElement>(null);
  const startButton = useRef<HTMLButtonElement>(null);
  const [place, setPlace] = useState<{ top: number; left: number; below: boolean } | null>(null);
  const root = anchor.current?.closest(".stage") ?? document.body;
  const close = useRef(onClose);
  close.current = onClose;

  useLayoutEffect(() => {
    const button = anchor.current;
    const box = card.current;
    if (!button || !box) return;
    const rect = button.getBoundingClientRect();
    const size = box.getBoundingClientRect();
    const below = rect.top - GAP - size.height < EDGE;
    const left = Math.min(Math.max(rect.left + rect.width / 2 - size.width / 2, EDGE), window.innerWidth - size.width - EDGE);
    setPlace({ top: below ? rect.bottom + GAP : rect.top - GAP - size.height, left, below });
  }, [anchor]);

  useEffect(() => startButton.current?.focus(), []);

  // Outside clicks and a scrolling list close it; the list would leave it pointing at nothing.
  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!card.current?.contains(target) && !anchor.current?.contains(target)) close.current(false);
    };
    const onScroll = (event: Event) => {
      if (!card.current?.contains(event.target as Node)) close.current(false);
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
      onSubmit={(event) => { event.preventDefault(); onStart(minutes); }}
      onKeyDown={(event) => {
        if (event.key === "Escape") { event.stopPropagation(); onClose(true); }
      }}
    >
      <NumberStepper variant="island" min={MIN_TODO_MINUTES} max={MAX_TODO_MINUTES} step={5}
        value={minutes} ariaLabel={t.todo.chooseDuration} onChange={onChange} />
      <span className="todo-duration-picker__unit">{t.todo.minutesUnit}</span>
      <button ref={startButton} className="todo-duration-picker__start" type="submit" aria-label={t.todo.startFor(minutes)}>
        <Play size={12} strokeWidth={2.6} />
      </button>
    </form>,
    root,
  );
}
