import type { TodoItem } from "./types";

export function getTodoSignature(date: string, todos: TodoItem[], dailyNote: string) {
  return JSON.stringify({
    date,
    todos: todos.map((todo) => ({
      title: todo.title,
      completed: todo.completed,
    })),
    dailyNote,
  });
}

export function formatTodosAsMarkdown(todos: TodoItem[]) {
  return todos
    .map((todo) => `- [${todo.completed ? "x" : " "}] ${todo.title}`)
    .join("\n");
}

export function formatTodoDocumentAsMarkdown(todos: TodoItem[], dailyNote: string) {
  const todoMarkdown = formatTodosAsMarkdown(todos);
  const dailyMarkdown = dailyNote.trimEnd();

  if (todoMarkdown && dailyMarkdown) {
    return `${todoMarkdown}\n\n${dailyMarkdown}`;
  }

  return todoMarkdown || dailyMarkdown;
}
