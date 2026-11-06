// Types for client.mjs, the FocuSD Island plugin SDK for Node.js.
// Method, event, permission and capability names come from protocol.d.mts,
// which `pnpm sdk:build` generates from plugins/schema/rpc.json.
import type { Capability, HostMethod, Permission, PluginEventName } from "./protocol.d.mts";

export type { Capability, HostMethod, Permission, PluginEventName } from "./protocol.d.mts";

/** A text in both languages, or one string for both. */
export type LocalizedText = string | { "zh-CN": string; en: string };

export interface InitializeParams {
  apiVersion: number;
  /** Since API version 2; empty for version 1 plugins. */
  capabilities?: Capability[];
  /** Since API version 2: what started the process, e.g. "onStartup" or "onCommand:refresh". */
  activationEvent?: string;
  appVersion: string;
  pluginId: string;
  dataDir: string;
  /** What the plugin may use now: its permissions plus the optional ones the user allowed. */
  permissions: Permission[];
  /** Since API version 2: the manifest's optionalPermissions (ask with permissions.request). */
  optionalPermissions?: Permission[];
  settings: Record<string, unknown>;
}

export interface HostError extends Error {
  /** -32001 missing permission, -32601 unknown method, -32000 the island answered with an error. */
  code: number;
  data?: { status?: number } & Record<string, unknown>;
}

export interface Todo {
  id: string;
  title: string;
  completed: boolean;
  [field: string]: unknown;
}

export interface TodosState {
  date: string;
  todos: Todo[];
  scheduled: Todo[];
  activeTodoId: string | null;
}

export interface ViewAction {
  id: string;
  title: LocalizedText;
  icon?: string;
}

export interface ListItem {
  id: string;
  title: LocalizedText;
  subtitle?: LocalizedText;
  note?: LocalizedText;
  icon?: string;
  checked?: boolean;
  /** https:// only; the island opens it in the browser. */
  url?: string;
  /** Without url: clicking sends view.action { actionId: action, itemId }. */
  action?: string;
  actions?: ViewAction[];
}

export interface ListModel {
  items?: ListItem[];
  groups?: { title?: LocalizedText; items: ListItem[] }[];
  empty?: LocalizedText;
  loading?: boolean;
  error?: LocalizedText;
  search?: { placeholder?: LocalizedText; mode?: "local" | "remote" };
}

export interface DetailModel {
  title?: LocalizedText;
  markdown?: LocalizedText;
  meta?: { label: LocalizedText; value: LocalizedText }[];
  actions?: ViewAction[];
  loading?: boolean;
  error?: LocalizedText;
}

export interface FormField {
  key: string;
  type: "boolean" | "string" | "number" | "select" | "multiline";
  title: LocalizedText;
  description?: LocalizedText;
  placeholder?: LocalizedText;
  value?: unknown;
  options?: { value: string; title: LocalizedText }[];
  min?: number;
  max?: number;
}

export interface FormModel {
  fields: FormField[];
  submitTitle?: LocalizedText;
  message?: LocalizedText;
  error?: LocalizedText;
}

export type Tone = "neutral" | "accent" | "warning" | "danger";

export interface StatusModel {
  primary: LocalizedText;
  secondary?: LocalizedText;
  caption?: LocalizedText;
  /** 0 to 1. */
  progress?: number;
  tone?: Tone;
  actions?: ViewAction[];
}

export type ViewModel = ListModel | DetailModel | FormModel | StatusModel;

/** What `views.patch` changes in a list page. */
export interface ViewPatch {
  /** Replace the items with these ids. */
  items?: ListItem[];
  /** Delete the items with these ids. */
  remove?: string[];
  /** Insert items: before the item `before`, else at the end of `groups[group]`, else at the end of `items`. */
  add?: { item: ListItem; before?: string; group?: number }[];
}

export interface ViewActionParams {
  viewId: string;
  actionId: string;
  itemId?: string;
  checked?: boolean;
}

export interface NotifyOptions {
  body?: string;
  durationMs?: number;
  actions?: { id: string; title: LocalizedText }[];
}

export interface CreatePluginOptions {
  input?: unknown;
  output?: { write(text: string): unknown };
  exit?: (code: number) => void;
}

type Off = () => void;
type Handler<T> = (value: T) => unknown;

export interface Plugin {
  call<T = unknown>(method: HostMethod | (string & {}), params?: unknown): Promise<T>;
  log(message: unknown): void;
  on(method: string, handler: Handler<any>): Off;
  readonly context: InitializeParams | null;
  hasCapability(name: Capability | (string & {})): boolean;
  onReady(handler: Handler<InitializeParams>): Off;
  onCommand(id: string, handler: Handler<Record<string, unknown>>): Off;
  /** A focusd://plugin/<id>/<path>?<query> link was opened; needs activationEvents onUri. `query` is still percent-encoded. */
  onUri(handler: Handler<{ uri: string; path: string; query: string }>): Off;
  onSettingsChanged(handler: Handler<Record<string, unknown>>): Off;
  onShutdown(handler: () => unknown): void;
  onEvent(name: PluginEventName | (string & {}), handler: Handler<any>): Off;
  onNotificationAction(id: string, handler: () => unknown): Off;
  settings(): Promise<Record<string, unknown>>;
  setInfo(items: { label: LocalizedText; value: string; copy?: boolean; secret?: boolean }[]): Promise<unknown>;
  info(): Promise<InitializeParams>;
  notify(title: string, options?: NotifyOptions): Promise<{ muted: boolean }>;
  keepAlive(reason: string | null): Promise<unknown>;
  permissions: {
    /** Asks the user for optional permissions (manifest optionalPermissions); needs the "permissions" capability. */
    request(...names: (Permission | Permission[])[]): Promise<{ granted: Permission[]; denied: Permission[] }>;
    /** True when the plugin may use `name` now: one of its permissions, or an optional one the user allowed. */
    has(name: Permission): boolean;
  };
  views: {
    update(viewId: string, model: ViewModel): Promise<unknown>;
    /**
     * Changes a list page without sending it whole: a list of items replaces
     * those with the same ids; or pass `{ items?, remove?, add? }`, where `add`
     * inserts before the item `before`, else at the end of `groups[group]`, else
     * at the end of the list. `missing` lists the ids that were not found.
     */
    patch(viewId: string, change: ListItem[] | ViewPatch): Promise<{ missing: string[] }>;
    onVisible(viewId: string, handler: Handler<boolean>): Off;
    onAction(viewId: string, handler: Handler<ViewActionParams>): Off;
    onSubmit(viewId: string, handler: Handler<Record<string, unknown>>): Off;
    onSearch(viewId: string, handler: Handler<string>): Off;
    /** Sends a message to a webview page; `shown` is false when the page is closed (the message is dropped). */
    postMessage(viewId: string, message: unknown): Promise<{ shown: boolean }>;
    /** Messages a webview page sends with `acquireFocusdApi().postMessage`. */
    onMessage(viewId: string, handler: Handler<unknown>): Off;
  };
  status: {
    update(itemId: string, text: string, options?: { tooltip?: string; tone?: Tone }): Promise<unknown>;
    clear(itemId: string): Promise<unknown>;
  };
  storage: {
    get<T = unknown>(key: string): Promise<T | null>;
    set(key: string, value: unknown): Promise<unknown>;
    delete(key: string): Promise<boolean>;
    keys(): Promise<string[]>;
  };
  secrets: {
    get(key: string): Promise<string | null>;
    set(key: string, value: string): Promise<unknown>;
    delete(key: string): Promise<boolean>;
  };
  todos: {
    list(): Promise<TodosState>;
    add(title: string, date?: string): Promise<Todo>;
    update(id: string, changes: { title?: string; completed?: boolean }): Promise<Todo>;
    remove(id: string): Promise<{ id: string }>;
  };
  note: {
    get(): Promise<{ date: string; note: string }>;
    set(note: string): Promise<{ date: string; note: string }>;
    append(text: string): Promise<{ date: string; note: string }>;
  };
  agentStatus: {
    report(source: string, status: { phase: string; name?: string; title?: string; taskId?: string }): Promise<unknown>;
    clear(source?: string): Promise<{ cleared: number }>;
  };
  clipboard: { history(limit?: number): Promise<{ items: { id: string; text: string; truncated: boolean; copiedAt: number; favorite: boolean }[] }> };
  messages: { list(): Promise<{ items: { source: string; id: string; sender: string; preview: string; receivedAt: number; unread?: number }[] }> };
  media: {
    nowPlaying(): Promise<Record<string, unknown>>;
    playPause(): Promise<Record<string, unknown>>;
    next(): Promise<Record<string, unknown>>;
    previous(): Promise<Record<string, unknown>>;
  };
  shelf: {
    list(): Promise<{ items: Record<string, unknown>[] }>;
    add(paths: string[]): Promise<{ items: Record<string, unknown>[] }>;
    remove(ids: string[]): Promise<{ items: Record<string, unknown>[] }>;
  };
}

export function createPlugin(options?: CreatePluginOptions): Plugin;
