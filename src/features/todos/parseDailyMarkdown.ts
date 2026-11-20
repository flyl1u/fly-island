export type MarkdownTodo = { title: string; completed: boolean };

export type ParsedDailyMarkdown = {
  /** No leading task list means that the document cannot authorize deleting tasks. */
  todos: MarkdownTodo[] | null;
  dailyNote: string;
};

/** The exported format has a leading list, then the daily note without a heading. */
export function parseDailyMarkdown(content: string): ParsedDailyMarkdown | null {
  const text = content.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");
  if (!text.trim() || /[\u0000\uFFFD]/u.test(text)) return null;
  const lines = text.split("\n");
  const todos: MarkdownTodo[] = [];
  let noteStart = lines.length;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (!line.trim()) continue;
    const item = /^\s*[-*+]\s+(.+?)\s*$/.exec(line);
    if (!item) {
      if (/^\s*[-*+]\s*$/.test(line)) return null;
      noteStart = index;
      break;
    }
    const checkbox = /^\[([ xX])\]\s+(.+)$/.exec(item[1]);
    // A half-written/unsupported checkbox must not turn into a renamed task.
    if (item[1].startsWith("[") && !checkbox) return null;
    const title = (checkbox ? checkbox[2] : item[1]).trim();
    if (!title) return null;
    todos.push({ title, completed: checkbox ? checkbox[1].toLowerCase() === "x" : false });
  }

  return { todos: todos.length ? todos : null, dailyNote: lines.slice(noteStart).join("\n").trimEnd() };
}
