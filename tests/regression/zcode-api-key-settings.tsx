import { act, StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { mockIPC } from "@tauri-apps/api/mocks";
import { I18nProvider, LOCALE_STORAGE_KEY, TRANSLATIONS } from "../../src/i18n";
import { ZcodeApiKeySettingsRow } from "../../src/features/agent-status/ZcodeApiKeySettingsRow";
import type { ZcodeApiPlatform } from "../../src/features/agent-status/api";
import "../../src/styles/tokens.css";
import "../../src/styles/base.css";

Object.assign(globalThis, { isTauri: true, IS_REACT_ACT_ENVIRONMENT: true });
const locale = new URLSearchParams(location.search).get("lang") === "en" ? "en" : "zh-CN";
localStorage.setItem(LOCALE_STORAGE_KEY, locale);
const text = TRANSLATIONS[locale].settings.agent.zcodeApiKey;
let stored = { platform: "bigmodel" as ZcodeApiPlatform, hasKey: false, maskedKey: null as string | null };
let usageError: string | null = null;
const usage = {
  updatedAt: Date.now(), fiveHour: { name: "", used: 10, resetsAt: null }, sevenDay: { name: "", used: 20, resetsAt: null },
  models: [], plan: "Coding Plan", source: "zcode",
};
const commands: { command: string; args: Record<string, unknown> }[] = [];

mockIPC((command, payload) => {
  const args = (payload ?? {}) as Record<string, unknown>;
  commands.push({ command, args });
  if (command === "get_zcode_api_key_settings") return stored;
  if (command === "save_zcode_api_key_settings") {
    stored = {
      platform: args.platform as ZcodeApiPlatform,
      hasKey: args.apiKey === null ? stored.hasKey : Boolean(args.apiKey),
      maskedKey: args.apiKey === null ? stored.maskedKey : args.apiKey ? "********" : null,
    };
    return stored;
  }
  if (command === "clear_zcode_api_key") {
    stored = { ...stored, hasKey: false, maskedKey: null };
    return stored;
  }
  if (command === "get_zcode_usage") {
    if (usageError) throw usageError;
    return stored.hasKey ? usage : null;
  }
  return null;
}, { shouldMockEvents: true });

const results: string[] = [];
function check(condition: unknown, label: string) {
  if (!condition) throw new Error(label);
  results.push(`PASS ${label}`);
}

const wait = () => act(async () => { await new Promise((resolve) => setTimeout(resolve, 40)); });
const findButton = (label: string) => [...document.querySelectorAll<HTMLButtonElement>("button")].find((button) => button.textContent?.trim() === label || button.getAttribute("aria-label") === label);
const findOption = (label: string) => [...document.querySelectorAll<HTMLLIElement>("[role='option']")].find((option) => option.textContent?.includes(label));
const root = createRoot(document.getElementById("fixture")!);
const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;

try {
  await act(async () => root.render(<StrictMode><I18nProvider><ZcodeApiKeySettingsRow polling={false} /></I18nProvider></StrictMode>));
  await wait();
  const input = document.querySelector<HTMLInputElement>(`input[aria-label='${text.apiKey}']`)!;
  check(input.type === "password", "Key field starts masked");
  await act(async () => {
    setValue.call(input, "glm-key-sample");
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await act(async () => findButton(text.show)!.click());
  check(input.type === "text", "Reveal control shows the entered key");
  await act(async () => findButton(text.hide)!.click());
  check(input.type === "password", "Reveal control hides the entered key");

  usageError = "zcode_usage:auth";
  await act(async () => findButton(text.save)!.click());
  await wait();
  check(stored.hasKey && stored.maskedKey === "********" && input.value === "", "Save keeps only masked key state in the UI");
  check(document.body.textContent?.includes(text.status.invalidKey) && !document.body.textContent?.includes("glm-key-sample"), "Invalid key or platform error is localized and does not expose the key");

  usageError = "zcode_usage:network";
  await act(async () => findButton(text.check)!.click());
  await wait();
  check(document.body.textContent?.includes(text.status.network), "Network failure is visible in the settings row");

  await act(async () => findButton(text.platform)!.click());
  await act(async () => findOption(text.platformOptions.zai)!.click());
  await wait();
  check(stored.platform === "zai" && commands.some(({ command, args }) => command === "save_zcode_api_key_settings" && args.apiKey === null), "Platform change persists without returning or replacing the key");

  usageError = null;
  await act(async () => findButton(text.clear)!.click());
  await wait();
  check(!stored.hasKey && stored.platform === "zai" && document.body.textContent?.includes(text.status.cleared), "Clear removes the key, keeps the platform, and refreshes usage");
  await act(async () => root.unmount());
  document.getElementById("results")!.textContent = [...results, "ALL PASS"].join("\n");
  document.documentElement.dataset.testResult = "passed";
} catch (error) {
  await act(async () => root.unmount());
  document.getElementById("results")!.textContent = [...results, `FAIL ${String(error)}`].join("\n");
  document.documentElement.dataset.testResult = "failed";
}
