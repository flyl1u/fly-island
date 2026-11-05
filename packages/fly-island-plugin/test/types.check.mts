// Type-checked by `pnpm check` (packages/tsconfig.json): the SDK's types work
// for the ways plugins use them. Not run.
import { createPlugin, type ListModel, type Plugin } from "../src/index.mjs";
import { startMockHost, type MockHost } from "../src/test/index.mjs";

const plugin: Plugin = createPlugin();
plugin.onReady((context) => plugin.log(context.capabilities?.includes("views") ? context.pluginId : "old island"));
plugin.onEvent("todos.changed", () => undefined);
plugin.onCommand("go", async (args) => {
  const count = (await plugin.storage.get<number>("count")) ?? 0;
  await plugin.storage.set("count", count + 1);
  const { todos } = await plugin.todos.list();
  const model: ListModel = { items: todos.map((todo) => ({ id: todo.id, title: todo.title, checked: todo.completed })), search: { mode: "local" } };
  await plugin.views.update("main", model);
  await plugin.status.update("open", `${todos.length}`, { tone: "accent" });
  plugin.log(String(args.todoId ?? ""));
});
// @ts-expect-error unknown tone
void plugin.status.update("open", "x", { tone: "loud" });
plugin.views.onAction("main", ({ actionId, itemId, checked }) => plugin.log(`${actionId} ${itemId ?? ""} ${checked ?? ""}`));

const host: MockHost = startMockHost(".", { deny: ["clipboard:read"], settings: { repo: "a/b" } });
void host.waitForView<ListModel>("main", (next) => (next.items ?? []).length > 0).then((next) => next.items?.[0]?.title);
void host.stop();
