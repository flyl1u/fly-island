import type { InitializeParams, Permission, TodosState, ViewModel } from "../client.mjs";

export const METHOD_NOT_FOUND: -32601;
export const PERMISSION_DENIED: -32001;
export const HOST_ERROR: -32000;

export interface MockHostOptions {
  /** Granted permissions; default: every permission the manifest asks for. */
  permissions?: Permission[];
  /** Sensitive permissions the user refuses: calls fail with -32001. */
  deny?: Permission[];
  /** Setting values on top of the manifest defaults. */
  settings?: Record<string, unknown>;
  /** Sent in initialize.activationEvent (API version 2); default "onStartup". */
  activationEvent?: string;
  appVersion?: string;
  /** Default: a new temporary folder, deleted by stop(). */
  dataDir?: string;
  /** For waitFor and friends; default 10 000 ms. */
  timeoutMs?: number;
  todos?: TodosState;
  note?: string;
  clipboard?: { id: string; text: string; truncated: boolean; copiedAt: number; favorite: boolean }[];
  messages?: { source: string; id: string; sender: string | null; preview: string | null; receivedAt: number; unread?: number }[];
  media?: Record<string, unknown>;
  shelf?: Record<string, unknown>[];
  storage?: Record<string, unknown>;
  secrets?: Record<string, string>;
  /** island.notify answers { muted: true }. */
  muted?: boolean;
  /** Start this instead of runtime.command: [program, args]. */
  command?: [string, string[]];
}

export interface RecordedRequest {
  method: string;
  params: unknown;
  result?: unknown;
  error?: { code: number; message: string; data?: { status?: number } };
}

export class MockHost {
  readonly dir: string;
  readonly manifest: Record<string, any>;
  readonly apiVersion: number;
  readonly dataDir: string;
  settings: Record<string, unknown>;
  todos: TodosState;
  note: string;
  readonly requests: RecordedRequest[];
  readonly logs: string[];
  readonly views: Map<string, ViewModel>;
  readonly statuses: Map<string, { text: string; tooltip?: string; tone?: string }>;
  readonly notifications: { title: string; body?: string; actions?: { id: string }[] }[];
  info: unknown[];
  keepAlive: string | null;
  readonly storage: Map<string, unknown>;
  readonly secrets: Map<string, string>;
  readonly subscriptions: Set<string>;
  readonly agentStatuses: Map<string, Record<string, unknown>>;
  /** undefined while running; the exit code (null if it could not start) after. */
  exitCode: number | null | undefined;
  readonly exited: Promise<number | null>;

  initializeParams(): InitializeParams;
  send(method: string, params?: unknown): void;
  command(id: string, args?: Record<string, unknown>): void;
  /** Sends an island event if the plugin subscribed to it; returns whether it did. */
  publish(name: string, payload?: unknown): boolean;
  changeSettings(values: Record<string, unknown>): void;
  viewVisible(viewId: string, visible?: boolean): void;
  viewAction(viewId: string, actionId: string, extra?: { itemId?: string; checked?: boolean }): void;
  viewSubmit(viewId: string, values: Record<string, unknown>): void;
  viewSearch(viewId: string, query: string): void;
  notificationAction(id: string): void;
  waitFor<T>(predicate: (host: MockHost) => T | undefined | null | false, timeoutMs?: number): Promise<T>;
  waitForRequest(method: string, from?: number): Promise<RecordedRequest>;
  waitForView<T extends ViewModel = ViewModel>(viewId: string, predicate?: (model: T) => boolean): Promise<T>;
  waitForLog(match: string | RegExp): Promise<string>;
  stop(): Promise<number | null>;
}

export function launchCommand(dir: string, runtime: unknown): [string, string[]];
/** Starts the plugin in `dir` (its focusd-plugin.json folder) under a mock host and sends initialize. */
export function startMockHost(dir: string, options?: MockHostOptions): MockHost;
