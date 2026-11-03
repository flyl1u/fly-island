export type TodoPageMode = "today" | "daily" | "archive" | "review";
export type ArchiveLayout = "cards" | "timeline";

export type TodoItem = {
  id: string;
  title: string;
  completed: boolean;
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
