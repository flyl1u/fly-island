// FocuSD Island plugin SDK for Node.js (no dependencies). Copy this file into
// your plugin. Protocol reference: docs/plugins/README.md.
import readline from "node:readline";

/**
 * Connects to FocuSD Island over stdin/stdout (JSON-RPC 2.0, one message per line).
 * The process exits when the island closes stdin or sends `shutdown`.
 * Write logs with `plugin.log()` or to stderr; never print other text to stdout.
 */
export function createPlugin() {
  let nextId = 1;
  const pending = new Map();
  const listeners = new Map();

  const send = (message) => process.stdout.write(`${JSON.stringify({ jsonrpc: "2.0", ...message })}\n`);
  const log = (message) => send({ method: "log", params: { message: String(message) } });

  const on = (method, handler) => {
    const list = listeners.get(method) ?? [];
    list.push(handler);
    listeners.set(method, list);
  };

  /** Calls a host method; rejects with an Error carrying `code` and `data`. */
  const call = (method, params) =>
    new Promise((resolve, reject) => {
      const id = nextId++;
      pending.set(id, { resolve, reject });
      send({ id, method, params });
    });

  const input = readline.createInterface({ input: process.stdin });
  input.on("line", (line) => {
    let message;
    try {
      message = JSON.parse(line);
    } catch {
      return;
    }
    if (message.id !== undefined && ("result" in message || "error" in message)) {
      const waiter = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) {
        waiter?.reject(Object.assign(new Error(message.error.message), { code: message.error.code, data: message.error.data }));
      } else {
        waiter?.resolve(message.result);
      }
      return;
    }
    for (const handler of listeners.get(message.method) ?? []) {
      Promise.resolve()
        .then(() => handler(message.params))
        .catch((error) => log(`Handler for ${message.method} failed: ${error?.message ?? error}`));
    }
  });
  input.on("close", () => process.exit(0));
  on("shutdown", () => process.exit(0));

  return {
    call,
    log,
    /** Runs once the island has started the plugin; receives { apiVersion, appVersion, pluginId, dataDir, permissions }. */
    onReady: (handler) => on("initialize", handler),
    /** Runs when the user clicks one of the commands from `contributes.commands`. */
    onCommand: (id, handler) => on("command", (params) => (params?.id === id ? handler() : undefined)),
    info: () => call("host.info"),
    todos: {
      list: () => call("todos.list"),
      add: (title, date) => call("todos.add", date ? { title, date } : { title }),
      update: (id, changes) => call("todos.update", { ...changes, id }),
      remove: (id) => call("todos.remove", { id }),
    },
    note: {
      get: () => call("note.get"),
      set: (note) => call("note.set", { note }),
      append: (text) => call("note.set", { append: text }),
    },
  };
}
