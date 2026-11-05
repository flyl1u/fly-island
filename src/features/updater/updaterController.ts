import { getVersion } from "@tauri-apps/api/app";
import { isTauri } from "@tauri-apps/api/core";
import { check, type Update } from "@tauri-apps/plugin-updater";
import { getUpdaterProxy, isUpdaterConfigured } from "./api";

export type UpdateStage =
  | "idle"
  | "checking"
  | "latest"
  | "available"
  | "downloading"
  | "installing"
  | "done"
  | "error"
  | "disabled";

export type UpdateState = {
  stage: UpdateStage;
  version: string;
  nextVersion: string;
  /** Release notes of `nextVersion`, as published in latest.json. */
  notes: string;
  downloaded: number;
  total: number;
  detail: string;
};

// The check/download run lives outside the settings panel on purpose: the panel
// is unmounted whenever another island page is opened, and the download has to
// keep going and stay visible when the user comes back.
const initialState: UpdateState = {
  stage: "idle",
  version: "",
  nextVersion: "",
  notes: "",
  downloaded: 0,
  total: 0,
  detail: "",
};

let state: UpdateState = initialState;
const listeners = new Set<() => void>();

let proxy: string | null = null;
let pending: Update | null = null;
let ready: Promise<void> | null = null;

function setState(patch: Partial<UpdateState>) {
  state = { ...state, ...patch };
  for (const listener of listeners) listener();
}

export function subscribeToUpdate(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getUpdateState() {
  return state;
}

export function errorReason(error: unknown) {
  const reason = error instanceof Error ? error.message : String(error);
  return reason.length > 240 ? `${reason.slice(0, 240)}…` : reason;
}

function busy(stage: UpdateStage) {
  return stage === "checking" || stage === "downloading" || stage === "installing";
}

function initialize() {
  ready ??= loadBuildInfo();
  return ready;
}

async function loadBuildInfo() {
  if (!isTauri()) {
    setState({ stage: "disabled" });
    return;
  }

  const [version, configured] = await Promise.all([
    getVersion().catch(() => ""),
    isUpdaterConfigured().catch(() => false),
  ]);
  proxy = await getUpdaterProxy().catch(() => null);

  setState({
    version,
    stage: configured ? state.stage : "disabled",
  });
}

async function closePending() {
  const update = pending;
  pending = null;
  if (!update) return;
  try {
    await update.close();
  } catch {
    // The installer takes over the update resource, so closing it can fail.
  }
}

/** Checks once per run, when the About page is first opened. A manual check, a
 * finished check or a running download is left alone. */
export async function checkOnFirstVisit() {
  await initialize();
  if (state.stage === "idle") await checkForUpdate();
}

export async function checkForUpdate() {
  await initialize();
  if (busy(state.stage) || state.stage === "disabled") return;

  await closePending();
  setState({ nextVersion: "", notes: "", downloaded: 0, total: 0, detail: "", stage: "checking" });

  try {
    const found = await check({ timeout: 20000, ...(proxy ? { proxy } : {}) });
    pending = found;

    if (!found) {
      setState({ stage: "latest" });
      return;
    }

    setState({ stage: "available", nextVersion: found.version, notes: found.body?.trim() ?? "" });
  } catch (error) {
    console.error("Failed to check for updates", error);
    setState({ stage: "error", detail: errorReason(error) });
  }
}

export async function installUpdate() {
  const update = pending;
  if (!update || busy(state.stage)) return;

  setState({ downloaded: 0, total: 0, detail: "", stage: "downloading" });

  try {
    await update.downloadAndInstall(
      (event) => {
        if (event.event === "Started") {
          setState({ total: event.data.contentLength ?? 0 });
          return;
        }

        if (event.event === "Progress") {
          setState({ downloaded: state.downloaded + event.data.chunkLength });
          return;
        }

        setState({ stage: "installing" });
      },
      { timeout: 600000, ...(proxy ? { proxy } : {}) },
    );
    setState({ stage: "done" });
  } catch (error) {
    console.error("Failed to install the update", error);
    setState({ stage: "error", detail: errorReason(error) });
  } finally {
    await closePending();
  }
}

void initialize();
