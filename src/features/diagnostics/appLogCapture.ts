import { isTauri } from "@tauri-apps/api/core";
import { appendAppLog, getAppLogState, listenAppLogChanged, type AppLogEntry } from "./api.ts";

// Each window's console errors and warnings, and errors nothing caught, go to the diagnostic log
// (src-tauri/src/app_log) while it is on. Sent in batches, at most once a second.
const FLUSH_DELAY_MS = 1000;
const MAX_PENDING = 200;

let enabled = false;
let pending: AppLogEntry[] = [];
let timer: number | null = null;

/** One line per value: errors with their stack, objects as JSON where they allow it. */
export function formatLogValue(value: unknown): string {
  if (value instanceof Error) return value.stack ?? `${value.name}: ${value.message}`;
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value) ?? String(value);
  } catch {
    return String(value);
  }
}

function flush() {
  timer = null;
  if (!pending.length) return;
  const batch = pending;
  pending = [];
  // A failed send is not logged: console.error would come straight back here.
  void appendAppLog(batch).catch(() => {});
}

function record(level: AppLogEntry["level"], values: unknown[]) {
  if (!enabled) return;
  if (pending.length < MAX_PENDING) pending.push({ level, message: values.map(formatLogValue).join(" ") });
  timer ??= window.setTimeout(flush, FLUSH_DELAY_MS);
}

/** Starts mirroring this window's errors into the log; call once per window. */
export function installAppLogCapture() {
  if (!isTauri()) return;
  for (const level of ["error", "warn"] as const) {
    const original = console[level].bind(console);
    console[level] = (...values: unknown[]) => {
      original(...values);
      record(level, values);
    };
  }
  window.addEventListener("error", (event) => record("error", [event.error ?? event.message]));
  window.addEventListener("unhandledrejection", (event) => record("error", ["Unhandled rejection:", event.reason]));
  void listenAppLogChanged((next) => { enabled = next; });
  void getAppLogState().then((state) => { enabled = state.enabled; }).catch(() => {});
}
