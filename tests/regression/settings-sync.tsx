// pnpm dev, then open /tests/regression/settings-sync.html. The island and the settings window both
// hold the island settings (useIslandSettings) and follow each other through storage events. What
// one window reads from the other's write must not be saved back: while a colour is dragged the
// other window has already written a newer value, and the echo would put the older one over it.
import { act } from "react";
import { createRoot } from "react-dom/client";
import { useIslandSettings } from "../../src/features/appearance/useIslandSettings";
import { STORAGE_KEY, loadSettings } from "../../src/features/appearance/storage";
import type { IslandSettings } from "../../src/features/appearance/types";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
const saved = localStorage.getItem(STORAGE_KEY);
const restore = () => {
  if (saved === null) localStorage.removeItem(STORAGE_KEY);
  else localStorage.setItem(STORAGE_KEY, saved);
};

// What the probe last rendered, and its setter; an object so TypeScript does not narrow it to null.
const probe: { settings: IslandSettings | null; update: (settings: IslandSettings) => void } = { settings: null, update: () => {} };
function Probe() {
  const [settings, setSettings] = useIslandSettings();
  probe.settings = settings;
  probe.update = setSettings;
  return null;
}

const messages: string[] = [];
const check = (condition: unknown, message: string) => {
  if (!condition) throw new Error(message);
  messages.push(`PASS ${message}`);
};
const stored = () => JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}") as Partial<IslandSettings>;
/** What the other window does: writes the key, which fires a storage event here. */
const otherWindowWrites = (pulseColor: string) => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...loadSettings(), pulseColor }));
};
const storageEvent = () => window.dispatchEvent(new StorageEvent("storage", { key: STORAGE_KEY }));

const root = createRoot(document.getElementById("probe")!);
try {
  localStorage.removeItem(STORAGE_KEY);
  await act(async () => { root.render(<Probe />); });

  // The other window drags the colour: #111111 is written and its event arrives here, but by the
  // time this window renders, #222222 is already stored.
  await act(async () => {
    otherWindowWrites("#111111");
    storageEvent();
    otherWindowWrites("#222222");
  });
  check(probe.settings?.pulseColor === "#111111", "The other window's write reaches this window");
  check(stored().pulseColor === "#222222", `What was read is not saved back over the newer value (${stored().pulseColor})`);
  await act(async () => { storageEvent(); });
  check(probe.settings?.pulseColor === "#222222" && stored().pulseColor === "#222222", "The newer value follows with its own event");

  // A change made in this window is still saved.
  await act(async () => { probe.update({ ...probe.settings!, pulseColor: "#333333" }); });
  check(stored().pulseColor === "#333333", "A change made in this window is saved");

  await act(async () => { root.unmount(); });
  document.documentElement.dataset.testResult = "passed";
} catch (error) {
  document.documentElement.dataset.testResult = "failed";
  messages.push(`FAIL ${String(error)}`);
  console.error(error);
} finally {
  restore();
  document.getElementById("results")!.textContent = messages.join("\n");
}
