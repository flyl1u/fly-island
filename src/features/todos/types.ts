export type TodoPageMode = "today" | "daily" | "upcoming" | "calendar";

export type TodoItem = {
  id: string;
  title: string;
  completed: boolean;
  createdAt: number;
  /** The update reminder, derived from the updater state and never stored. */
  kind?: "update";
};

/** A todo planned for a later day; it joins that day's list when the day arrives. */
export type ScheduledTodo = {
  id: string;
  title: string;
  /** Local date, YYYY-MM-DD. */
  date: string;
  createdAt: number;
};

export type TodoArchive = {
  date: string;
  todos: TodoItem[];
  dailyNote: string;
  savedAt: number;
  savedToDisk: boolean;
  filePath?: string;
};

export type SaveState = "idle" | "saving" | "saved" | "needs-path" | "error";
export type SavePathState = "idle" | "saved";
