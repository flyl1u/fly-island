// Example plugin: logs how many todos are open, and on request writes a short
// digest of them into the daily note.
import { createPlugin } from "./lib/focusd.mjs";

const plugin = createPlugin();
const LOG_EVERY_MS = 30 * 60 * 1000;

async function logOpenCount() {
  const { todos } = await plugin.todos.list();
  plugin.log(`${todos.filter((todo) => !todo.completed).length} open todos`);
}

plugin.onReady(async ({ appVersion, permissions }) => {
  plugin.log(`ready (FocuSD ${appVersion}; permissions: ${permissions.join(", ")})`);
  await logOpenCount();
  setInterval(() => void logOpenCount().catch((error) => plugin.log(error.message)), LOG_EVERY_MS);
});

plugin.onCommand("write-digest", async () => {
  const { todos } = await plugin.todos.list();
  const open = todos.filter((todo) => !todo.completed);
  const time = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const lines = open.length === 0 ? ["all done"] : open.map((todo) => `- ${todo.title}`);
  await plugin.note.append([`[${time}] open todos: ${open.length}`, ...lines].join("\n"));
  plugin.log(`digest written (${open.length} open)`);
});
