// What the mock host answers: every host method from plugins/schema/rpc.json,
// with data kept in memory, the same permission rules as the island and the
// limits plugin authors most often run into.
import { eventPermissions, methodPermissions } from "../schema.mjs";

export const METHOD_NOT_FOUND = -32601;
export const PERMISSION_DENIED = -32001;
export const HOST_ERROR = -32000;
const MAX_MODEL_BYTES = 256 * 1024;
const MAX_VALUE_BYTES = 64 * 1024;
const MAX_STORAGE_BYTES = 1024 * 1024;
const NOTIFY_PER_MINUTE = 6;
/** Methods only plugins on API version 2 have; version 1 gets "unknown method". */
const V2_OPEN = new Set(["events.subscribe", "events.unsubscribe", "host.keepAlive", "view.update", "view.patch", "status.update", "webview.postMessage", "storage.get", "storage.set", "storage.delete", "storage.keys", "permissions.request", "island.openView"]);

/** permissions.request like plugin_host/optional.rs: the user (the mock's `deny` option) answers each name. */
function requestPermissions(host, params) {
  const names = Array.isArray(params?.permissions) ? params.permissions : [];
  if (names.length === 0 || names.length > 14) fail(400, "Expected { permissions: [name] } with 1-14 names.");
  const granted = [];
  const denied = [];
  for (const name of new Set(names)) {
    if (typeof name !== "string" || !(host.granted.includes(name) || host.optional.includes(name))) {
      fail(400, `"${name}" is not in the plugin's permissions or optionalPermissions.`);
    }
    if (host.denied.has(name)) denied.push(name);
    else {
      if (host.optional.includes(name)) host.allowedOptional.add(name);
      granted.push(name);
    }
  }
  return { granted, denied };
}

export class RpcError extends Error {
  constructor(code, message, status) {
    super(message);
    this.code = code;
    this.data = status === undefined ? undefined : { status };
  }
}

const fail = (status, message) => {
  throw new RpcError(HOST_ERROR, message, status);
};
const text = (value, max, what) => {
  if (typeof value !== "string" || value.trim() === "" || [...value].length > max) fail(400, `"${what}" must be 1-${max} characters.`);
  return value;
};
const size = (value) => Buffer.byteLength(JSON.stringify(value ?? null), "utf8");
const todayString = () => new Date().toISOString().slice(0, 10);

function todosMethod(host, method, params) {
  const state = host.todos;
  const find = (id) => state.todos.find((todo) => todo.id === id) ?? state.scheduled.find((todo) => todo.id === id) ?? fail(404, "Todo not found.");
  switch (method) {
    case "todos.list":
      if (params?.date !== undefined && params.date !== state.date) return dayOf(host, params.date, "todos");
      return structuredClone(state);
    case "todos.days":
      return daysOf(host, params);
    case "todos.add": {
      const todo = { id: `mock-${host.nextTodoId++}`, title: text(params?.title, 500, "title"), completed: false };
      const date = params?.date;
      if (date !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(date)) fail(400, "date must be YYYY-MM-DD.");
      (date && date > state.date ? state.scheduled : state.todos).push(date && date > state.date ? { ...todo, date } : todo);
      host.publish("todos.changed", { date: state.date });
      return todo;
    }
    case "todos.update": {
      const todo = find(params?.id);
      if (params.title !== undefined) todo.title = text(params.title, 500, "title");
      if (params.completed !== undefined) todo.completed = Boolean(params.completed);
      host.publish("todos.changed", { date: state.date });
      return { ...todo };
    }
    default: {
      find(params?.id);
      state.todos = state.todos.filter((todo) => todo.id !== params.id);
      state.scheduled = state.scheduled.filter((todo) => todo.id !== params.id);
      host.publish("todos.changed", { date: state.date });
      return { id: params.id };
    }
  }
}

function viewMethod(host, method, params) {
  const views = (host.manifest.contributes?.views ?? []).map((view) => view.id);
  const items = (host.manifest.contributes?.statusItems ?? []).map((item) => item.id);
  if (method === "status.update") {
    if (!items.includes(params?.itemId)) fail(404, `Unknown status item "${params?.itemId}".`);
    if (typeof params.text !== "string" || [...params.text].length > 24) fail(400, '"text" must be a string of at most 24 characters.');
    if (params.text === "") host.statuses.delete(params.itemId);
    else host.statuses.set(params.itemId, { text: params.text, tooltip: params.tooltip, tone: params.tone });
    return {};
  }
  if (!views.includes(params?.viewId)) fail(404, `Unknown view "${params?.viewId}".`);
  if (method === "webview.postMessage") {
    const view = host.manifest.contributes.views.find((item) => item.id === params.viewId);
    if (view.template !== "webview") fail(400, `The plugin has no webview page "${params.viewId}".`);
    if (size({ type: "message", message: params.message ?? null }) > MAX_MODEL_BYTES) fail(400, "The message is larger than 256 KB.");
    const shown = host.openWebviews.has(params.viewId);
    if (shown) host.webviewMessages.push({ viewId: params.viewId, message: structuredClone(params.message ?? null) });
    return { shown };
  }
  if (method === "view.update") {
    if (params.model === null || typeof params.model !== "object" || Array.isArray(params.model)) fail(400, '"model" must be an object.');
    if (size(params.model) > MAX_MODEL_BYTES) fail(413, "The model is larger than 256 KB.");
    host.views.set(params.viewId, structuredClone(params.model));
    return {};
  }
  const model = host.views.get(params.viewId) ?? fail(409, "Send view.update first.");
  return patchModel(model, params);
}

/** view.patch like plugin_host/views.rs patch_model: replace `items`, delete `remove`, insert `add`. */
function patchModel(model, params) {
  const list = (name) => {
    const value = params[name];
    if (value === undefined || value === null) return [];
    if (!Array.isArray(value)) fail(400, `Expected "${name}" as a list.`);
    return value;
  };
  const [items, remove, add] = [list("items"), list("remove"), list("add")];
  if (items.length + remove.length + add.length === 0) fail(400, 'Expected "items", "remove" or "add".');
  const lists = () => [model.items, ...(model.groups ?? []).map((group) => group.items)].filter(Array.isArray);
  const missing = [];

  const replacements = new Map(items.map((item) => [typeof item?.id === "string" ? item.id : fail(400, 'Every patched item needs an "id" string.'), item]));
  for (const entries of lists()) {
    entries.forEach((entry, index) => {
      if (replacements.has(entry.id)) {
        entries[index] = structuredClone(replacements.get(entry.id));
        replacements.delete(entry.id);
      }
    });
  }
  missing.push(...replacements.keys());

  const gone = new Set(remove.map((id) => (typeof id === "string" ? id : fail(400, '"remove" lists item ids (strings).'))));
  const removed = new Set();
  for (const entries of lists()) {
    for (let index = entries.length - 1; index >= 0; index -= 1) {
      if (gone.has(entries[index].id)) {
        removed.add(entries[index].id);
        entries.splice(index, 1);
      }
    }
  }
  missing.push(...[...gone].filter((id) => !removed.has(id)));

  for (const spec of add) {
    const item = spec?.item;
    if (item === null || typeof item !== "object" || Array.isArray(item)) fail(400, 'Every added entry needs "item" as an object.');
    if (typeof item.id !== "string") fail(400, 'Every added item needs an "id" string.');
    if (lists().some((entries) => entries.some((entry) => entry.id === item.id))) fail(400, `The view already has an item "${item.id}"; replace it with "items".`);
    if (typeof spec.before === "string") {
      const entries = lists().find((candidate) => candidate.some((entry) => entry.id === spec.before));
      if (entries) {
        entries.splice(entries.findIndex((entry) => entry.id === spec.before), 0, structuredClone(item));
        continue;
      }
      missing.push(spec.before);
    }
    if (spec.group === undefined || spec.group === null) {
      if (!Array.isArray(model.items)) model.items = [];
      model.items.push(structuredClone(item));
    } else {
      const group = Number.isInteger(spec.group) ? model.groups?.[spec.group] : undefined;
      if (!group || typeof group !== "object") fail(400, `The view has no group ${spec.group} with a list of items.`);
      if (group.items === undefined) group.items = [];
      if (!Array.isArray(group.items)) fail(400, `The view has no group ${spec.group} with a list of items.`);
      group.items.push(structuredClone(item));
    }
  }
  return { missing };
}

function storageMethod(host, method, params) {
  const key = method === "storage.keys" ? null : text(params?.key, 128, "key");
  switch (method) {
    case "storage.get":
      return { value: host.storage.has(key) ? structuredClone(host.storage.get(key)) : null };
    case "storage.set": {
      if (!params || !("value" in params)) fail(400, 'Expected { key, value }.');
      if (size(params.value) > MAX_VALUE_BYTES) fail(413, "A value can be at most 64 KB.");
      const next = new Map(host.storage).set(key, structuredClone(params.value));
      if (size(Object.fromEntries(next)) > MAX_STORAGE_BYTES) fail(413, "The plugin's storage can hold at most 1 MB.");
      host.storage.set(key, structuredClone(params.value));
      return {};
    }
    case "storage.delete":
      return { deleted: host.storage.delete(key) };
    default:
      return { keys: [...host.storage.keys()].sort() };
  }
}

function subscriptions(host, subscribe, params) {
  const names = params?.events;
  if (!Array.isArray(names)) fail(400, "Expected { events: [string] }.");
  if (names.length > 16) fail(400, "At most 16 events at once.");
  for (const name of names) {
    const permission = eventPermissions().get(name);
    if (permission === undefined) fail(400, `Unknown event "${name}".`);
    if (subscribe && permission) host.checkPermission(permission);
  }
  for (const name of names) {
    if (subscribe) host.subscriptions.add(name);
    else host.subscriptions.delete(name);
  }
  return { events: [...host.subscriptions].sort() };
}

function notify(host, params) {
  text(params?.title, 80, "title");
  const now = Date.now();
  host.notifyTimes = host.notifyTimes.filter((at) => now - at < 60_000);
  if (host.notifyTimes.length >= NOTIFY_PER_MINUTE) fail(429, "At most 6 messages a minute.");
  host.notifyTimes.push(now);
  host.notifications.push(structuredClone(params));
  return { muted: host.muted };
}

function secretMethod(host, method, params) {
  const key = params?.key;
  if (typeof key !== "string" || !/^[A-Za-z0-9._-]{1,64}$/.test(key)) fail(400, "The key must be 1-64 letters, digits, '.', '_' or '-'.");
  if (method === "secrets.get") return { value: host.secrets.get(key) ?? null };
  if (method === "secrets.delete") return { deleted: host.secrets.delete(key) };
  if (typeof params.value !== "string" || params.value.length > 1024) fail(400, '"value" must be a string of at most 1024 characters.');
  if (!host.secrets.has(key) && host.secrets.size >= 32) fail(413, "At most 32 secrets.");
  host.secrets.set(key, params.value);
  return {};
}

const isDate = (value) => typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);

/** Another day, like src-tauri/src/todos/history.rs: an archive (host.archives) or the scheduled list. */
function dayOf(host, date, what) {
  if (!isDate(date)) fail(400, "\"date\" must look like YYYY-MM-DD.");
  const state = host.todos;
  if (date > state.date) {
    if (what === "note") fail(400, "A note exists only for today and archived days.");
    return { date, todos: [], scheduled: structuredClone(state.scheduled.filter((todo) => todo.date === date)), activeTodoId: null };
  }
  const archive = host.archives.find((item) => item.date === date) ?? fail(404, `Nothing was archived for ${date}.`);
  return what === "note"
    ? { date, note: archive.dailyNote, archived: true }
    : { date, todos: structuredClone(archive.todos), scheduled: [], activeTodoId: null, archived: true };
}

function daysOf(host, params) {
  const { from, to } = params ?? {};
  if (!isDate(from) || !isDate(to)) fail(400, "Send { from, to } as YYYY-MM-DD dates.");
  if (from > to) fail(400, "\"from\" must not be after \"to\".");
  const inRange = (date) => from <= date && date <= to;
  const summary = (date, todos, note, archived) => ({ date, total: todos.length, completed: todos.filter((todo) => todo.completed).length, hasNote: note.trim() !== "", archived });
  const days = host.archives.filter((item) => inRange(item.date) && item.date !== host.todos.date).map((item) => summary(item.date, item.todos, item.dailyNote, true));
  if (inRange(host.todos.date)) days.push(summary(host.todos.date, host.todos.todos, host.note, false));
  return { days: days.sort((left, right) => left.date.localeCompare(right.date)) };
}

function dataMethod(host, method, params) {
  const data = host.data;
  switch (method) {
    case "note.get":
      if (params?.date !== undefined && params.date !== host.todos.date) return dayOf(host, params.date, "note");
      return { date: host.todos.date, note: host.note };
    case "note.set":
      host.note = typeof params?.append === "string" ? `${host.note}${host.note ? "\n" : ""}${params.append}` : String(params?.note ?? "");
      host.publish("note.changed", { date: host.todos.date });
      return { date: host.todos.date, note: host.note };
    case "agentStatus.report": {
      const source = text(params?.source, 64, "source");
      const status = { ...params, id: `${host.manifest.id}/${source}` };
      host.agentStatuses.set(source, status);
      return status;
    }
    case "agentStatus.clear": {
      const before = host.agentStatuses.size;
      if (params?.source === undefined) host.agentStatuses.clear();
      else host.agentStatuses.delete(params.source);
      return { cleared: before - host.agentStatuses.size };
    }
    case "clipboard.history":
      return { items: data.clipboard.slice(0, Math.min(50, Math.max(1, params?.limit ?? 20))) };
    case "messages.list":
      return { items: data.messages };
    case "media.nowPlaying":
      return data.media;
    case "media.playPause":
      data.media = { ...data.media, status: data.media.status === "playing" ? "paused" : "playing" };
      return data.media;
    case "media.next":
    case "media.previous":
      return data.media;
    case "media.cover":
      return { cover: data.cover };
    case "media.seek": {
      const position = params?.positionMs;
      if (!Number.isInteger(position) || position < 0) fail(400, "Expected { positionMs }, a whole number of milliseconds from 0.");
      data.media = { ...data.media, positionMs: position };
      return data.media;
    }
    case "media.setVolume": {
      const level = params?.level;
      if (typeof level !== "number" || level < 0 || level > 1) fail(400, "Expected { level } from 0 to 1.");
      data.media = { ...data.media, volume: level };
      return data.media;
    }
    case "media.toggleShuffle":
      data.media = { ...data.media, shuffle: !data.media.shuffle };
      return data.media;
    case "media.cycleRepeat": {
      const next = { none: "list", list: "track" };
      data.media = { ...data.media, repeat: next[data.media.repeat] ?? "none" };
      return data.media;
    }
    case "shelf.list":
      return { items: data.shelf };
    case "shelf.add":
      for (const path of params?.paths ?? []) data.shelf.push({ id: `shelf-${data.shelf.length + 1}`, path, name: path.split(/[\\/]/).pop(), isDir: false, size: 0, addedAt: Date.now(), pinned: false, missing: false, unreachable: false });
      return { items: data.shelf };
    case "shelf.remove":
      data.shelf = data.shelf.filter((item) => !(params?.ids ?? []).includes(item.id));
      return { items: data.shelf };
    default:
      throw new RpcError(METHOD_NOT_FOUND, `Unknown method "${method}".`);
  }
}

/** Answers one request like the island would; throws RpcError for errors. */
export function answer(host, method, params) {
  const v2 = host.apiVersion >= 2;
  switch (method) {
    case "host.info":
      return host.initializeParams();
    case "settings.get":
      return { ...host.settings };
    case "ui.setInfo":
      if (!Array.isArray(params?.items) || params.items.length > 10) fail(400, "Expected { items: [...] } with at most 10 items.");
      host.info = structuredClone(params.items);
      return {};
    default:
  }
  if (V2_OPEN.has(method)) {
    if (!v2) throw new RpcError(METHOD_NOT_FOUND, `Unknown method "${method}".`);
    if (method.startsWith("events.")) return subscriptions(host, method === "events.subscribe", params);
    if (method.startsWith("storage.")) return storageMethod(host, method, params);
    if (method === "host.keepAlive") {
      const reason = params?.reason ?? null;
      host.keepAlive = reason === null ? null : text(reason, 100, "reason");
      return {};
    }
    if (method === "permissions.request") return requestPermissions(host, params);
    if (method === "island.openView") {
      // The mock host has no user, so the "right after the user used it" rule is not checked.
      if (!(host.manifest.contributes?.views ?? []).some((view) => view.id === params?.viewId)) fail(404, `"${params?.viewId}" is not one of the plugin's contributes.views.`);
      host.openedViews.push(params.viewId);
      return {};
    }
    return viewMethod(host, method, params);
  }
  const permission = methodPermissions().get(method);
  if (!permission) throw new RpcError(METHOD_NOT_FOUND, `Unknown method "${method}".`);
  host.checkPermission(permission);
  if (method.startsWith("todos.")) return todosMethod(host, method, params);
  if (method === "island.notify") return notify(host, params);
  if (method.startsWith("secrets.")) return secretMethod(host, method, params);
  return dataMethod(host, method, params);
}

export function emptyTodos() {
  return { date: todayString(), todos: [], scheduled: [], activeTodoId: null };
}
