import { useEffect, useState, type CSSProperties } from "react";
import "./CollapsedTodoContent.css";

export type TodoRotationDisplay = {
  titles: string[];
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
  const [transition, setTransition] = useState({ current: title, previous: null as string | null, version: 0 });
  if (title !== transition.current) {
    setTransition({ current: title, previous: rotation?.paused ? null : transition.current, version: transition.version + 1 });
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
          {[...titles, ...titles].map((text, index) => <span className="todo-rotation__row" key={index}>{prefix}{text}</span>)}
        </span>
      </span>
    );
  }
  return (
    <span className="island__active-task todo-rotation" aria-label={title}>
      {rotation && previous !== null && !rotation.paused && (
        <span key={version - 1} className="todo-rotation__layer todo-rotation__layer--outgoing" aria-hidden="true">
          <span className="todo-rotation__row">{prefix}{previous}</span>
        </span>
      )}
      <span key={version} className={`todo-rotation__layer${rotation && previous !== null && !rotation.paused ? " todo-rotation__layer--incoming" : ""}`}>
        <span className="todo-rotation__row">{prefix}{title}</span>
      </span>
    </span>
  );
}
