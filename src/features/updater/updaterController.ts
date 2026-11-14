import { getVersion } from "@tauri-apps/api/app";
import { isTauri } from "@tauri-apps/api/core";
import {
  checkUpdate,
  downloadAndInstallUpdate,
  downloadUpdate,
  getUpdaterProxy,
  isUpdaterConfigured,
  listenUpdateRequests,
  listenUpdateState,
  publishUpdateState,
  requestUpdateAction,
  type DownloadEvent,
} from "./api";
import { nextCheckDelay } from "./autoUpdateSchedule.ts";
import { loadAutoUpdate, saveAutoUpdate } from "./storage.ts";

export type UpdateStage =
  | "idle"
  | "checking"
  | "latest"
  | "available"
  | "downloading"
  | "ready"
  | "installing"
  | "done"
  | "error"
  | "disabled";

export type UpdateState = {
  stage: UpdateStage;
  version: string;
  nextVersion: string;
  downloaded: number;
  total: number;
  detail: string;
  /** The user hid the update todo; the settings panel still offers the restart. */
  dismissed: boolean;
  /** Checks every few hours and installs once the island sits idle; otherwise only on request. */
  autoUpdate: boolean;
};

// Only the main window owns the update: the standalone settings window can be
// destroyed and recreated without interrupting the download or starting another
// one, so it mirrors the main window's state and forwards its actions there.
const windowKind = new URLSearchParams(window.location.search).get("window");
const remoteSettings = windowKind === "settings";
const initialState: UpdateState = {
  stage: "idle",
  version: "",
  nextVersion: "",
  downloaded: 0,
  total: 0,
  detail: "",
  dismissed: false,
  autoUpdate: loadAutoUpdate(),
};

let state: UpdateState = initialState;
const listeners = new Set<() => void>();

let proxy: string | null = null;
let initialized = false;
let checkTimer: ReturnType<typeof setTimeout> | null = null;
/** Automatic checks in a row that ended in an error; picks the retry delay. */
let failures = 0;

// The translation window shares this bundle but stays out of the update flow,
// otherwise every startup would check and download twice.
function isMainWindow() {
  return windowKind === null || windowKind === "main";
}

function setState(patch: Partial<UpdateState>) {
  state = { ...state, ...patch };
  for (const listener of listeners) listener();
  if (isMainWindow() && isTauri()) {
    void publishUpdateState(state).catch((error) => console.error("Failed to share update state", error));
  }
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

function trackProgress(event: DownloadEvent) {
  if (event.event === "Started") setState({ total: event.data.contentLength ?? 0 });
  else if (event.event === "Progress") setState({ downloaded: state.downloaded + event.data.chunkLength });
}

async function initialize() {
  if (initialized) return;
  initialized = true;

  if (!isTauri()) {
    setState({ stage: "disabled" });
    return;
  }

  if (remoteSettings) {
    await listenUpdateState((snapshot) => setState(snapshot));
    await requestUpdateAction({ action: "snapshot" });
    return;
  }

  if (!isMainWindow()) return;

  await listenUpdateRequests((request) => {
    if (request.action === "check") void checkForUpdate();
    else if (request.action === "install") void installUpdate();
    else if (request.action === "dismiss") dismissUpdatePrompt();
    else if (request.action === "auto") applyAutoUpdate(request.enabled);
    else void publishUpdateState(state).catch((error) => console.error("Failed to share update state", error));
  });

  const [version, configured] = await Promise.all([
    getVersion().catch(() => ""),
    isUpdaterConfigured().catch(() => false),
  ]);

  setState({
    version,
    stage: configured ? state.stage : "disabled",
  });

  if (configured && state.autoUpdate) scheduleCheck(0);
}

/** Asked before every check: a proxy turned on or off since startup would otherwise fail all three endpoints. */
async function refreshProxy() {
  proxy = await getUpdaterProxy().catch(() => proxy);
}

async function findUpdate() {
  setState({ nextVersion: "", downloaded: 0, total: 0, detail: "", dismissed: false, stage: "checking" });
  try {
    const found = await checkUpdate(proxy);
    if (!found) {
      setState({ stage: "latest" });
      return false;
    }
    setState({ stage: "available", nextVersion: found.version });
    return true;
  } catch (error) {
    console.error("Failed to check for updates", error);
    setState({ stage: "error", detail: errorReason(error) });
    return false;
  }
}

/** Downloads the found update without installing it; installing waits for the user. */
async function downloadFound() {
  setState({ downloaded: 0, total: 0, detail: "", stage: "downloading" });
  try {
    await downloadUpdate(trackProgress);
    // A dismissed flag stays: hiding the todo mid-download must not bring it back.
    setState({ stage: "ready" });
  } catch (error) {
    // Keep offering the update: the todo's button downloads it again when installing.
    console.error("Failed to download the update", error);
    setState({ stage: "available", downloaded: 0, total: 0, detail: errorReason(error) });
  }
}

async function findAndDownload() {
  await refreshProxy();
  if (await findUpdate()) await downloadFound();
}

function clearScheduledCheck() {
  if (checkTimer === null) return;
  clearTimeout(checkTimer);
  checkTimer = null;
}

/** One timer at a time, and none while automatic updates are off. */
function scheduleCheck(delay: number) {
  clearScheduledCheck();
  if (!state.autoUpdate) return;
  checkTimer = setTimeout(() => {
    checkTimer = null;
    void runAutomaticCheck();
  }, delay);
}

/**
 * Checks and downloads quietly, then waits six hours; a failed check or download is
 * retried sooner. A downloaded update installs once the island sits idle
 * (useIdleUpdateInstall), and the todo list offers it before that.
 */
async function runAutomaticCheck() {
  if (!state.autoUpdate || state.stage === "disabled") return;
  const settled = busy(state.stage) || state.stage === "ready" || state.stage === "done";
  if (!settled) {
    await findAndDownload();
    // A failed download stays "available" (with the reason) so the todo still offers it; retry it soon too.
    const failed = state.stage === "error" || (state.stage === "available" && state.detail !== "");
    failures = failed ? failures + 1 : 0;
  }
  scheduleCheck(nextCheckDelay(failures));
}

function applyAutoUpdate(enabled: boolean) {
  if (enabled === state.autoUpdate) return;
  failures = 0;
  setState({ autoUpdate: enabled });
  if (enabled) scheduleCheck(0);
  else clearScheduledCheck();
}

/** Settings → About: saved here, applied by the main window, which owns the update. */
export function setAutoUpdate(enabled: boolean) {
  saveAutoUpdate(enabled);
  if (!remoteSettings) {
    applyAutoUpdate(enabled);
    return;
  }
  setState({ autoUpdate: enabled });
  void requestUpdateAction({ action: "auto", enabled }).catch((error) => console.error("Failed to change automatic updates", error));
}

export async function checkForUpdate() {
  if (remoteSettings) return requestUpdateAction({ action: "check" });
  if (busy(state.stage) || state.stage === "disabled") return;
  await findAndDownload();
}

/** Hiding the todo row installs nothing and keeps the downloaded package. */
export function dismissUpdatePrompt() {
  if (remoteSettings) {
    void requestUpdateAction({ action: "dismiss" }).catch((error) => console.error("Failed to dismiss update prompt", error));
    return;
  }
  if (!state.dismissed) setState({ dismissed: true });
}

export async function installUpdate() {
  if (remoteSettings) return requestUpdateAction({ action: "install" });
  if (busy(state.stage) || (state.stage !== "available" && state.stage !== "ready")) return;

  const downloadedAlready = state.stage === "ready";
  setState(downloadedAlready ? { stage: "installing" } : { downloaded: 0, total: 0, detail: "", stage: "downloading" });
  try {
    await downloadAndInstallUpdate((event) => {
      if (event.event === "Finished") setState({ stage: "installing" });
      else trackProgress(event);
    });
    setState({ stage: "done" });
  } catch (error) {
    console.error("Failed to install the update", error);
    setState({ stage: "error", detail: errorReason(error) });
  }
}

void initialize().catch((error) => {
  console.error("Failed to initialize updates", error);
  setState({ stage: "error", detail: errorReason(error) });
});
