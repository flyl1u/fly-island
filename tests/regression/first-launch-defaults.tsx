import { initializeFirstLaunchDefaults } from "../../src/windows/island/initializeDefaults";
import { FIRST_LAUNCH_SETTINGS } from "../../src/features/appearance";
import { loadSettings } from "../../src/features/appearance/storage";
import { isFirstLaunch } from "../../src/features/onboarding/firstLaunch";
import { FIRST_LAUNCH_DEFAULTS_KEY } from "../../src/features/onboarding/storage";
import "../../src/styles/tokens.css";

// Keep the browser's real storage intact; both startup calls share this test-only profile.
let values = new Map<string, string>();
const descriptor = Object.getOwnPropertyDescriptor(window, "localStorage");
const memoryStorage: Storage = {
  get length() { return values.size; },
  key: index => [...values.keys()][index] ?? null,
  getItem: key => values.get(key) ?? null,
  setItem: (key, value) => { values.set(key, String(value)); },
  removeItem: key => { values.delete(key); },
  clear: () => { values.clear(); },
};
Object.defineProperty(window, "localStorage", { configurable: true, value: memoryStorage });
const results: string[] = [];
const check = (condition: boolean, label: string) => {
  results.push(`${condition ? "PASS" : "FAIL"} ${label}`);
  if (!condition) throw new Error(label);
};

try {
  check(Boolean(navigator.locks), "shared browser lock is available");
  await Promise.all([initializeFirstLaunchDefaults(false), initializeFirstLaunchDefaults(true)]);
  check(values.get(FIRST_LAUNCH_DEFAULTS_KEY) === "complete", "translation-first startup finishes once");
  check(isFirstLaunch(), "main retains welcome content after another window seeds preferences");
  check(JSON.stringify(loadSettings()) === JSON.stringify(FIRST_LAUNCH_SETTINGS), "fresh settings survive normalization and migrations");
  check(values.get("fly-island-wechat-message-preview-enabled") === "false", "WeChat content stays disabled");
  check(JSON.parse(values.get("fly-island-translation-settings") ?? "null").shortcut === "Alt+V", "translation uses captured shortcut");

  values.set("fly-island-settings", '{"todoTimerEnabled":false}');
  values.set("fly-island-wechat-message-preview-enabled", "true");
  const changed = JSON.stringify([...values]);
  await initializeFirstLaunchDefaults(true);
  check(JSON.stringify([...values]) === changed, "later user choices survive restart");

  for (const entries of [
    [["fly-island-settings", '{"todoTimerEnabled":false}']],
    [["fly-island-settings", "{broken"]],
    [["fly-island-todos", "[]"]],
    [["fly-island-locale", "en"]],
    [["fly-island-wechat-message-preview-enabled", "true"]],
  ]) {
    values = new Map(entries.map(([key, value]) => [key, value]));
    const before = JSON.stringify([...values]);
    await initializeFirstLaunchDefaults(true);
    check(JSON.stringify([...values]) === before, `existing profile stays unchanged: ${entries[0][0]}`);
  }
  check(loadSettings().todoTimerEnabled === false, "old missing timer field retains compatibility default");
  document.documentElement.dataset.testResult = "passed";
} catch (error) {
  results.push(`FAIL ${String(error)}`);
  document.documentElement.dataset.testResult = "failed";
} finally {
  if (descriptor) Object.defineProperty(window, "localStorage", descriptor);
  const output = document.getElementById("results");
  if (output) output.textContent = results.join("\n");
}
