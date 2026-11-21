import { act, StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { mockIPC } from "@tauri-apps/api/mocks";
import { I18nProvider, LOCALE_STORAGE_KEY, TRANSLATIONS } from "../../src/i18n";
import { ZcodeApiKeySettingsRow } from "../../src/features/agent-status/ZcodeApiKeySettingsRow";
import { useAgentUsages } from "../../src/features/agent-status/useAgentUsages";
import type { ZcodeApiKeySettings, ZcodeApiPlatform } from "../../src/features/agent-status/api";
import "../../src/styles/tokens.css";
import "../../src/styles/base.css";

Object.assign(globalThis, { isTauri: true, IS_REACT_ACT_ENVIRONMENT: true });
const locale = new URLSearchParams(location.search).get("lang") === "en" ? "en" : "zh-CN";
localStorage.setItem(LOCALE_STORAGE_KEY, locale);
const text = TRANSLATIONS[locale].settings.agent.zcodeApiKey;
let stored: ZcodeApiKeySettings = { platform: "bigmodel", hasKey: false, maskedKey: null };
let usageError: string | null = null;
const key = "example-only-1a2b";
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
    stored = { ...stored, platform: args.platform as ZcodeApiPlatform };
    if (typeof args.apiKey === "string") stored = { ...stored, hasKey: true, maskedKey: `····${args.apiKey.slice(-4)}` };
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

function Fixture() {
  const quotas = useAgentUsages(true, { zcode: true, claudeCode: false, codex: false, dsh: false });
  return <>
    <ZcodeApiKeySettingsRow polling={false} />
    <output id="quota">{quotas.zcode?.fiveHour?.used ?? ""}</output>
  </>;
}

const results: string[] = [];
function check(condition: unknown, label: string) {
  if (!condition) throw new Error(label);
  results.push(`PASS ${label}`);
}

const button = (label: string) => [...document.querySelectorAll<HTMLButtonElement>("button")]
  .find((item) => item.textContent?.trim() === label || item.getAttribute("aria-label") === label)!;
const dialog = () => document.querySelector<HTMLDialogElement>("dialog");
const input = () => dialog()!.querySelector<HTMLInputElement>("input")!;
const savedStatus = () => document.querySelector(".zcode-api-key__summary")?.textContent;
const quota = () => document.getElementById("quota")?.textContent;
const click = (label: string) => act(async () => button(label).click());
const choosePlatform = async (platform: ZcodeApiPlatform) => {
  await click(text.platform);
  await act(async () => dialog()!.querySelector<HTMLLIElement>(`[role=option][data-value=${platform}]`)!.click());
};
const fixture = document.getElementById("fixture")!;
const root = createRoot(fixture);
const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;

try {
  fixture.style.width = "260px";
  await act(async () => root.render(<StrictMode><I18nProvider><Fixture /></I18nProvider></StrictMode>));
  const trigger = button(text.settings);
  check(fixture.querySelectorAll(".settings-row").length === 1
    && fixture.textContent?.includes(text.title) && savedStatus() === text.empty && !dialog(), "Settings shows a single credential row");
  check(fixture.scrollWidth <= fixture.clientWidth, "The compact credential row fits a narrow settings panel");

  await click(text.settings);
  check(dialog()?.matches(":modal") && dialog()!.contains(document.activeElement) && input().type === "password",
    "Settings opens a modal with focus inside and a password field");
  await choosePlatform("zai");
  check(stored.platform === "bigmodel", "Platform changes stay in the dialog until submitted");
  let escapedToWindow = false;
  window.addEventListener("keydown", () => { escapedToWindow = true; }, { once: true });
  await act(async () => {
    dialog()!.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    // An untrusted keydown cannot trigger the browser default for Escape.
    dialog()!.dispatchEvent(new Event("cancel", { cancelable: true }));
  });
  check(!dialog() && document.activeElement === trigger && !escapedToWindow && stored.platform === "bigmodel",
    "Escape closes only the dialog, discards changes and returns focus to Settings");

  await click(text.settings);
  await act(async () => {
    dialog()!.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
    dialog()!.click();
  });
  check(!dialog() && document.activeElement === trigger, "Clicking the backdrop closes and restores focus");

  await click(text.settings);
  await choosePlatform("zai");
  await act(async () => {
    setValue.call(input(), key);
    input().dispatchEvent(new Event("input", { bubbles: true }));
  });
  await click(text.show);
  check(input().type === "text" && input().value === key, "Only the draft key can be revealed");
  await click(text.hide);
  check(input().type === "password", "The draft key can be hidden again");
  const readsBeforeSave = commands.filter(({ command }) => command === "get_zcode_usage").length;
  await click(text.save);
  check(!dialog() && stored.platform === "zai" && stored.hasKey && savedStatus() === text.saved("····1a2b", text.platformNames.zai)
    && document.activeElement === trigger, "Save closes the dialog and shows only the mask and platform");
  check(commands.filter(({ command }) => command === "get_zcode_usage").length > readsBeforeSave && quota() === "10",
    "Save checks the quota and updates the ring immediately");

  await click(text.settings);
  check(input().value === "" && input().placeholder === text.savedPlaceholder("····1a2b") && !document.body.textContent?.includes(key),
    "A saved key is represented by a mask in an empty field");
  const narrowDialog = dialog()!;
  narrowDialog.style.width = "260px";
  await click(text.platform);
  const menu = narrowDialog.querySelector<HTMLElement>("[role=listbox]")!;
  const bounds = narrowDialog.getBoundingClientRect();
  check(bounds.left >= 0 && bounds.right <= document.documentElement.clientWidth && narrowDialog.scrollWidth <= narrowDialog.clientWidth
    && menu.getBoundingClientRect().left >= bounds.left && menu.getBoundingClientRect().right <= bounds.right
    && narrowDialog.querySelector("footer")!.scrollWidth <= narrowDialog.querySelector("footer")!.clientWidth,
    "The platform menu, fields and actions fit a narrow dialog");
  await click(text.platform);

  usageError = "zcode_usage:auth";
  await click(text.save);
  check(dialog()?.querySelector("[role=alert]")?.textContent === text.status.invalidKey
    && savedStatus()?.includes(text.status.invalidKey), "An invalid key keeps the dialog open and updates the row status");
  check(input().value === "" && commands.some(({ command, args }) => command === "save_zcode_api_key_settings" && args.apiKey === null),
    "Submitting the empty field retains the saved key");
  usageError = "zcode_usage:network";
  await click(text.save);
  check(dialog()?.querySelector("[role=alert]")?.textContent === text.status.network, "Network failure stays in the dialog");

  usageError = null;
  await click(text.clear);
  check(!stored.hasKey && stored.platform === "zai" && savedStatus() === text.empty && !dialog()
    && document.activeElement === trigger && quota() === "", "Clear keeps the platform and refreshes the desktop fallback");
  await click(text.settings);
  check(!button(text.clear), "The clear action is only offered for a saved key");
  await click(text.cancel);
  check(!dialog() && document.activeElement === trigger, "Cancel returns to the credential row");

  await act(async () => root.unmount());
  document.getElementById("results")!.textContent = [...results, "ALL PASS"].join("\n");
  document.documentElement.dataset.testResult = "passed";
} catch (error) {
  await act(async () => root.unmount());
  document.getElementById("results")!.textContent = [...results, `FAIL ${String(error)}`].join("\n");
  document.documentElement.dataset.testResult = "failed";
}
