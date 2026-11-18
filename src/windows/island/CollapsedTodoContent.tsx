import { useEffect, useState, type CSSProperties } from "react";
import { TodoCountdown } from "../../features/todos/TodoCountdown";
import { isTodoTimerEndingSoon, type TodoTimer } from "../../features/todos/timer";
import { useTranslation } from "../../i18n";
import "./CollapsedTodoContent.css";

export type TodoRotationDisplay = {
  ids: string[];
  titles: string[];
  timers: (TodoTimer | null)[];
  selectedIndex: number;
  mode: "switch" | "scroll";
  speed: number;
  paused: boolean;
};

/** The same single text slot as messages; scrolling duplicates its track for a seamless loop. */
export function CollapsedTodoContent({ title, prefix, rotation }: {
  title: string;
  prefix: string;
  rotation?: TodoRotationDisplay | null;
}) {
  const t = useTranslation();
  const row = (text: string, timer: TodoTimer | null, key?: number, todoId?: string) => <span className={`todo-rotation__row${timer && isTodoTimerEndingSoon(timer) ? " island__active-task--ending" : ""}`} key={key} data-rotating-todo-id={todoId}>
    <span className="todo-rotation__title">{prefix}{text}</span>
    {timer && <span className="island__timer-pill">{timer.notified ? t.todo.timeUp : <TodoCountdown endsAt={timer.endsAt} warning={isTodoTimerEndingSoon(timer)} />}</span>}
  </span>;
  const currentTimer = rotation?.timers[rotation.selectedIndex] ?? null;
  const id = rotation?.ids[rotation.selectedIndex] ?? title;
  const current = { id, title, timer: currentTimer };
  const [transition, setTransition] = useState({ current, previous: null as typeof current | null, version: 0 });
  if (id !== transition.current.id || title !== transition.current.title) {
    setTransition({ current, previous: rotation?.paused ? null : transition.current, version: transition.version + 1 });
  } else if (currentTimer !== transition.current.timer) {
    setTransition({ ...transition, current });
  }
  const { previous, version } = transition;
  useEffect(() => {
    if (previous === null) return;
    const timer = window.setTimeout(() => setTransition((state) => state.version === version
      ? { ...state, previous: null } : state), 720);
    return () => window.clearTimeout(timer);
  }, [previous, version]);

  if (rotation?.mode === "scroll" && rotation.titles.length > 1) {
    const { titles, speed, paused } = rotation;
    return (
      <span className="island__active-task todo-rotation todo-rotation--scroll" aria-label={titles.join(" · ")}>
        <span className="todo-rotation__track" key={JSON.stringify([titles, speed])} aria-hidden="true"
          style={{ "--todo-scroll-duration": `${titles.length * 28 / speed}s`, animationPlayState: paused ? "paused" : "running" } as CSSProperties}>
          {[...titles, ...titles].map((text, index) => row(text, rotation.timers[index % titles.length] ?? null, index, rotation.ids[index % titles.length]))}
        </span>
      </span>
    );
  }
  return (
    <span className="island__active-task todo-rotation" aria-label={title} data-rotating-todo-id={id}>
      {rotation && previous !== null && !rotation.paused && (
        <span key={version - 1} className="todo-rotation__layer todo-rotation__layer--outgoing" aria-hidden="true">
          {row(previous.title, previous.timer)}
        </span>
      )}
      <span key={version} className={`todo-rotation__layer${rotation && previous !== null && !rotation.paused ? " todo-rotation__layer--incoming" : ""}`}>
        {row(title, currentTimer)}
      </span>
    </span>
  );
}
