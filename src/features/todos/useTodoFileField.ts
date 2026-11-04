import { useEffect, type Dispatch, type SetStateAction } from "react";
import type { TodosData } from "./api";
import { subscribeTodoFile } from "./todoStore";

/** Puts changes a plugin or script made to one field of todos.json into React state. */
export function useTodoFileField<Key extends keyof TodosData>(key: Key, setValue: Dispatch<SetStateAction<TodosData[Key]>>) {
  useEffect(
    () =>
      subscribeTodoFile((data, changed) => {
        if (changed.has(key)) setValue(data[key]);
      }),
    [key, setValue],
  );
}
