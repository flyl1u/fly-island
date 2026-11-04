import { getVersion } from "@tauri-apps/api/app";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { check, type Update } from "@tauri-apps/plugin-updater";

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
  dismissed: boolean;
};

// The check/download run lives outside the settings panel on purpose: the panel
// is unmounted whenever another island page is opened, and the download has to
// keep going and stay visible when the user comes back.
const initialState: UpdateState = {
  stage: "idle",
  version: "",
  nextVersion: "",
  downloaded: 0,
  total: 0,
  detail: "",
  dismissed: false,
};

let state: UpdateState = initialState;const listeners = new Set<() => void>();

let proxy: string | null = null;
let pending: Update | null = null;
let initialized = false;
let startupCheckStarted = false;

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

// Hiding the todo row must not install anything or drop the downloaded
// package: the settings panel keeps offering the same restart action.
export function dismissUpdatePrompt() {
  if (state.dismissed) return;
  setState({ dismissed: true });
}

export function errorReason(error: unknown) {
  const reason = error instanceof Error ? error.message : String(error);
  return reason.length > 240 ? `${reason.slice(0, 240)}…` : reason;
}

function busy(stage: UpdateStage) {
  return stage === "checking" || stage === "downloading" || stage === "installing";
}

// The translation window shares this bundle but must stay out of the update
// flow, otherwise every startup would check and download twice.
function isMainWindow() {
  return new URLSearchParams(window.location.search).get("window") !== "translation";
}

async function initialize() {
  if (initialized) return;
  initialized = true;

  if (!isTauri()) {
    setState({ stage: "disabled" });
    return;
  }

  const [version, configured] = await Promise.all([
    getVersion().catch(() => ""),
    invoke<boolean>("updater_configured").catch(() => false),
  ]);
  proxy = await invoke<string | null>("get_updater_proxy").catch(() => null);

  setState({
    version,
    stage: configured ? state.stage : "disabled",
  });

  if (configured && isMainWindow()) {
    void runStartupUpdate();
  }
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

async function findUpdate() {
  await closePending();
  setState({ nextVersion: "", downloaded: 0, total: 0, detail: "", dismissed: false, stage: "checking" });

  try {
    const found = await check({ timeout: 20000, ...(proxy ? { proxy } : {}) });
    pending = found;

    if (!found) {
      setState({ stage: "latest" });
      return null;
    }

    setState({ stage: "available", nextVersion: found.version });
    return found;
  } catch (error) {
    console.error("Failed to check for updates", error);
    setState({ stage: "error", detail: errorReason(error) });
    return null;
  }
}

async function downloadPending() {
  const update = pending;
  if (!update) return;

  setState({ downloaded: 0, total: 0, detail: "", stage: "downloading" });

  try {
    await update.download(
      (event) => {
        if (event.event === "Started") {
          setState({ total: event.data.contentLength ?? 0 });
          return;
        }

        if (event.event === "Progress") {
          setState({ downloaded: state.downloaded + event.data.chunkLength });
        }
      },
      { timeout: 600000, ...(proxy ? { proxy } : {}) },
    );
    // Keep the update handle open: installing is deferred until the user agrees
    // to restart, and closing it would throw the downloaded package away.
    // Keep a dismissed flag: if the user hid the todo while it was downloading,
    // finishing the download must not pop it back up.
    setState({ stage: "ready" });
  } catch (error) {
    console.error("Failed to download the update", error);
    setState({ stage: "error", detail: errorReason(error) });
  }
}

async function runStartupUpdate() {
  if (startupCheckStarted || state.stage !== "idle") return;
  startupCheckStarted = true;

  const found = await findUpdate();
  if (!found) return;

  await downloadPending();
}

export async function checkForUpdate() {
  if (busy(state.stage) || state.stage === "disabled") return;
  await findUpdate();
}

export async function installUpdate() {
  const update = pending;
  if (!update || busy(state.stage)) return;

  // A downloaded package only needs the installer to run; on Windows that
  // exits the app and the NSIS installer relaunches the new version itself.
  if (state.stage === "ready") {
    setState({ stage: "installing" });
    try {
      await update.install();
    } catch (error) {
      console.error("Failed to install the update", error);
      setState({ stage: "error", detail: errorReason(error) });
    }
    return;
  }

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
