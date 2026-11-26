import { useSyncExternalStore } from "react";
import { getPluginInstalls, onPluginInstallProgress, type PluginInstallProgress, type PluginInstallPhase } from "./api";
import { isJobActive, isJobOver, restoreJobs, withJob, withoutJob, type PluginJobs } from "./jobs.ts";
import { pluginFailureCode } from "./errors.ts";
import { refreshPlugins } from "./usePlugins";
import { PLUGIN_RUNTIME_ENABLED } from "../releaseFlags.ts";

// One store per window, kept outside React so a job survives switching settings pages.
let current: PluginJobs = {};
const listeners = new Set<() => void>();
/** Plugins with news since the last question to the host. */
let newer = new Set<string>();
let generation = 0;
let unlisten: (() => void) | undefined;

function publish(next: PluginJobs) {
  if (next === current) return;
  current = next;
  listeners.forEach((listener) => listener());
}

/** The card shows the installed state only once the new snapshot is in. */
async function settle(id: string) {
  await refreshPlugins();
  if (current[id]?.phase !== "failed") publish(withoutJob(current, id));
}

function receive(job: PluginInstallProgress) {
  newer.add(job.id);
  if (isJobOver(job)) void settle(job.id);
  else publish(withJob(current, job));
}

/** A reopened settings window learns what is still running from the host. */
async function restore() {
  newer = new Set();
  try {
    const listed = await getPluginInstalls();
    if (Array.isArray(listed)) publish(restoreJobs(current, listed, newer));
  } catch { /* The web demo has no native plugin host. */ }
}

function subscribe(listener: () => void) {
  if (!PLUGIN_RUNTIME_ENABLED) return () => {};
  listeners.add(listener);
  if (listeners.size === 1) {
    const subscribed = ++generation;
    void onPluginInstallProgress(receive).then((stop) => {
      if (subscribed !== generation) { stop(); return; }
      unlisten = stop;
      // "done" events sent while nothing listened were missed: ask the host what is left.
      void restore();
    }).catch(() => { if (subscribed === generation) void restore(); });
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) {
      generation += 1;
      unlisten?.();
      unlisten = undefined;
    }
  };
}

const getSnapshot = () => current;
export function usePluginJobs() { return useSyncExternalStore(subscribe, getSnapshot); }

/** Forgets a shown failure, e.g. once the user does something else with the plugin. */
export function clearPluginJob(id: string) {
  if (current[id] && !isJobActive(current[id])) publish(withoutJob(current, id));
}

/**
 * Runs an install or removal with the card busy from the click on. Does nothing while the
 * plugin already has one running; a failure stays on the card until the next attempt.
 */
export async function runPluginJob(id: string, phase: PluginInstallPhase, action: () => Promise<unknown>) {
  if (isJobActive(current[id])) return;
  newer.add(id);
  publish(withJob(current, { id, phase, downloaded: 0, total: 0, error: null }));
  try {
    await action();
    await settle(id);
  } catch (error) {
    const code = pluginFailureCode(error);
    if (code === "plugin_install_in_progress") {
      // Another window started it; follow that one.
      publish(withoutJob(current, id));
      await restore();
      return;
    }
    if (code === "plugin_install_cancelled") {
      // The user's own choice, not a failure: the card goes back to how it was.
      publish(withoutJob(current, id));
      await refreshPlugins();
      return;
    }
    const failure = phase === "uninstalling" ? "plugin_uninstall_failed" : code ?? null;
    publish(withJob(current, { id, phase: "failed", downloaded: 0, total: 0, error: failure }));
    await refreshPlugins();
  }
}
