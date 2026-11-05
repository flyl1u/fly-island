// main.mjs / src/main.mts of a new plugin written in JavaScript or TypeScript.
// The same code serves both; `ts` adds the few type annotations TypeScript needs.

const json = (value) => JSON.stringify(value);

function header(options) {
  const from = options.language === "typescript" ? "../lib/focusd.mjs" : "./lib/focusd.mjs";
  return `// ${options.name.en}: a FocuSD Island plugin. Protocol and API:
// https://github.com/TixXin/fly-island/blob/main/docs/plugins/README.md
import { createPlugin } from ${json(from)};

const plugin = createPlugin();

plugin.onReady((context) => {
  plugin.log(\`started (\${context.activationEvent ?? "onStartup"})\`);
});
`;
}

const bodies = {
  blank: () => `
plugin.onSettingsChanged((settings) => {
  plugin.log(\`settings changed: \${JSON.stringify(settings)}\`);
});
`,
  command: (ts) => `
// Runs when the user clicks "Say hello" on the plugin's page in Settings.
plugin.onCommand("hello", async () => {
  const count = ((await plugin.storage.get${ts ? "<number>" : ""}("count")) ?? 0) + 1;
  await plugin.storage.set("count", count);
  await plugin.notify(\`Hello #\${count}\`, { body: "This message came from a plugin." });
});
`,
  list: (ts) => `${ts ? "\ntype Item = { id: string; title: string; done: boolean };\n" : ""}
const VIEW = "main";
const DEFAULT_ITEMS${ts ? ": Item[]" : ""} = [
  { id: "1", title: "Open this page from the island", done: true },
  { id: "2", title: "Tick an item", done: false },
  { id: "3", title: "Run \\"Add an item\\" on the plugin's page in Settings", done: false },
];
let items${ts ? ": Item[] | null" : ""} = null;

async function load() {
  items ??= (await plugin.storage.get${ts ? "<Item[]>" : ""}("items")) ?? DEFAULT_ITEMS;
  return items;
}

async function save(next${ts ? ": Item[]" : ""}) {
  items = next;
  await plugin.storage.set("items", next);
  await show();
}

async function show() {
  const list = await load();
  await plugin.views.update(VIEW, {
    search: { placeholder: { "zh-CN": "筛选", en: "Filter" } },
    items: list.map((item) => ({
      id: item.id,
      title: item.title,
      checked: item.done,
      actions: [{ id: "remove", title: { "zh-CN": "删除", en: "Remove" } }],
    })),
    empty: { "zh-CN": "没有条目", en: "Nothing here" },
  });
}

// The island only shows the page while it is open; send the model then.
plugin.views.onVisible(VIEW, (visible) => (visible ? show() : undefined));

plugin.views.onAction(VIEW, async ({ actionId, itemId, checked }) => {
  const list = await load();
  if (actionId === "check") await save(list.map((item) => (item.id === itemId ? { ...item, done: Boolean(checked) } : item)));
  if (actionId === "remove") await save(list.filter((item) => item.id !== itemId));
});

plugin.onCommand("add", async () => {
  const list = await load();
  const id = String(Math.max(0, ...list.map((item) => Number(item.id) || 0)) + 1);
  await save([...list, { id, title: \`New item \${id}\`, done: false }]);
});
`,
  status: () => `
// Shows how many of today's todos are open on the collapsed island and updates
// it when they change. The subscription keeps this on-demand plugin running.
async function refresh() {
  const { todos } = await plugin.todos.list();
  const open = todos.filter((todo) => !todo.completed).length;
  await plugin.status.update("open", open === 0 ? "All done" : \`\${open} open\`, { tooltip: "Open todos today" });
}

plugin.onReady(() => refresh());
plugin.onEvent("todos.changed", () => refresh());
`,
};

/** The plugin's main file for JavaScript (main.mjs) or TypeScript (src/main.mts). */
export function nodeMain(options) {
  return header(options) + bodies[options.template](options.language === "typescript");
}

/** test/plugin.test.mjs: drives the plugin with the mock host. */
export function nodeTest(options) {
  const checks = {
    blank: `  host.changeSettings({});
  await host.waitForLog("settings changed");`,
    command: `  host.command("hello");
  await host.waitFor((state) => state.notifications.length === 1);
  assert.equal(host.notifications[0].title, "Hello #1");
  assert.equal(host.storage.get("count"), 1);`,
    list: `  host.viewVisible("main");
  const model = await host.waitForView("main");
  assert.equal(model.items.length, 3);
  host.command("add");
  await host.waitForView("main", (next) => next.items.length === 4);
  host.viewAction("main", "remove", { itemId: "1" });
  await host.waitForView("main", (next) => next.items.length === 3);`,
    status: `  await host.waitFor((state) => state.statuses.get("open"));
  assert.equal(host.statuses.get("open").text, "All done");
  await host.waitFor((state) => state.subscriptions.has("todos.changed"));
  host.todos.todos.push({ id: "a", title: "Write a test", completed: false });
  host.publish("todos.changed", { date: host.todos.date });
  await host.waitFor((state) => state.statuses.get("open")?.text === "1 open");`,
  };
  return `// Runs the plugin under the mock host from fly-island-plugin (no island needed):
//   npm test   (or npx fly-island-plugin test)
import assert from "node:assert/strict";
import test from "node:test";
import { startMockHost } from "fly-island-plugin/test";

test(${json(`${options.template} plugin works`)}, async () => {
  const host = startMockHost(".");
  try {
${checks[options.template]}
  } finally {
    await host.stop();
  }
});
`;
}
