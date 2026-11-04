import { useEffect, useState, type ReactNode } from "react";
import { prepareTodoStore } from "../../features/todos/todoMigration";

/**
 * Renders the island only after the todos are ready (moved to todos.json, or
 * left in localStorage), so no todo is shown or saved from the wrong place.
 */
export function TodosGate({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let mounted = true;
    void prepareTodoStore().finally(() => {
      if (mounted) setReady(true);
    });
    return () => {
      mounted = false;
    };
  }, []);

  return ready ? children : null;
}
