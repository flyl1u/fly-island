// The settings search over single settings (issue #11). Two uses:
// - ?collect=<locale>&state=<default|on>: opens every page and puts its rows (title, group,
//   description, choices) on <html data-index>; `pnpm settings:index` reads them into
//   src/windows/settings/searchIndex.json. `on` switches every switch on first, so rows that only
//   show under one are found too.
// - otherwise (pnpm test:regression): checks that every row the pages show is in that index, then
//   searches for a row title, a description word, a joined-up phrase and an English word.
import { act, StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "../../src/styles/tokens.css";
import "../../src/styles/fonts.css";
import "../../src/styles/base.css";
import { SettingsWindow } from "../../src/windows/settings/SettingsWindow";
import { DEFAULT_SETTINGS } from "../../src/features/appearance/settings";
import { I18nProvider, LOCALE_STORAGE_KEY } from "../../src/i18n";
import searchIndex from "../../src/windows/settings/searchIndex.json";
import type { SettingsRowText, SettingsSearchEntry } from "../../src/windows/settings/settingsSearch";
import "./settingsMocks";

const query = new URLSearchParams(location.search);
const collect = query.get("collect");
Object.assign(globalThis, { isTauri: true, IS_REACT_ACT_ENVIRONMENT: true });
const original = new Map(Object.entries(localStorage).filter(([key]) => key.startsWith("focusd-island-")));
window.addEventListener("beforeunload", () => {
  for (const key of Object.keys(localStorage).filter((key) => key.startsWith("focusd-island-"))) {
    if (!original.has(key)) localStorage.removeItem(key);
  }
  for (const [key, value] of original) localStorage.setItem(key, value);
});
for (const key of Object.keys(localStorage).filter((key) => key.startsWith("focusd-island-"))) localStorage.removeItem(key);
localStorage.setItem(LOCALE_STORAGE_KEY, collect === "en" ? "en" : "zh-CN");
localStorage.setItem("focusd-island-save-directory", "");
localStorage.setItem("focusd-island-qq-notification-access-requested", "true");
if (query.get("state") === "on") {
  const allOn = Object.fromEntries(Object.entries(DEFAULT_SETTINGS).map(([key, value]) => [key, typeof value === "boolean" ? true : value]));
  localStorage.setItem("focusd-island-settings", JSON.stringify(allOn));
  localStorage.setItem("focusd-island-agent-push", JSON.stringify({ enabled: true }));
  localStorage.setItem("focusd-island-agent-approval", JSON.stringify({ onIsland: true, whenInFront: true }));
  localStorage.setItem("focusd-island-agent-sounds", JSON.stringify({ enabled: true, quietHours: { enabled: true, start: "22:00", end: "08:00" } }));
}

const root = createRoot(document.getElementById("root")!);
const results = document.getElementById("results")!;
const messages: string[] = [];
const check = (condition: unknown, message: string) => {
  if (!condition) throw new Error(message);
  messages.push(`PASS ${message}`);
};
const wait = (ms: number) => act(() => new Promise<void>((resolve) => setTimeout(resolve, ms)));
const text = (element: Element | null | undefined) => (element?.textContent ?? "").replace(/\s+/g, " ").trim();
const categories = () => [...document.querySelectorAll<HTMLElement>(".settings-sidebar__item")].map((item) => item.dataset.category!);
const openPage = async (category: string) => {
  await act(async () => { document.querySelector<HTMLButtonElement>(`.settings-sidebar__item[data-category='${category}']`)!.click(); });
  // Pages that read their data first (plugins, hosts) fill in a moment later.
  await wait(60);
};

/** The rows the open page shows, as the index keeps them. */
function rowsOnPage(): SettingsRowText[] {
  const rows = [...document.querySelectorAll<HTMLElement>(".editor-panel .settings-row")].filter((row) => !row.closest("[data-search='off']"));
  return rows.flatMap((row) => {
    const title = text(row.querySelector(".settings-row__title"));
    if (!title) return [];
    const description = text(row.querySelector(".settings-row__description"));
    const options = [...row.querySelectorAll(".settings-row__control option, .settings-row__control .settings-choice__option")].map(text).filter(Boolean);
    const group = text(row.closest(".settings-group")?.querySelector(".settings-group__title"));
    return [{ group, title, ...(description ? { description } : {}), ...(options.length ? { options } : {}) }];
  });
}

const type = async (value: string) => {
  const input = document.querySelector<HTMLInputElement>(".settings-sidebar__search input")!;
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
  await act(async () => { setter.call(input, value); input.dispatchEvent(new Event("input", { bubbles: true })); });
};
const pressEnter = () => act(async () => {
  document.querySelector<HTMLInputElement>(".settings-sidebar__search input")!.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
});
const hits = (page?: string) =>
  [...document.querySelectorAll<HTMLElement>(`.settings-sidebar__hit${page ? `[data-page='${page}']` : ""}`)].map((hit) => text(hit));
const current = () => document.querySelector<HTMLElement>(".settings-sidebar__item--active")?.dataset.category;

try {
  await act(async () => { root.render(<StrictMode><I18nProvider><SettingsWindow /></I18nProvider></StrictMode>); });
  if (collect) {
    const rows: ({ page: string } & SettingsRowText)[] = [];
    for (const category of categories()) {
      await openPage(category);
      rows.push(...rowsOnPage().map((row) => ({ page: category, ...row })));
    }
    document.documentElement.dataset.index = JSON.stringify(rows);
    results.textContent = `PASS collected ${rows.length} rows\nALL PASS`;
    document.documentElement.dataset.testResult = "passed";
  } else {
    const entries = searchIndex.entries as SettingsSearchEntry[];
    check(entries.length > 50, "The index lists the settings of every page (run pnpm settings:index if it is empty)");
    const missing: string[] = [];
    for (const category of categories()) {
      await openPage(category);
      const known = new Set(entries.filter((entry) => entry.page === category).map((entry) => entry["zh-CN"].title));
      for (const row of rowsOnPage()) if (!known.has(row.title)) missing.push(`${category} › ${row.title}`);
    }
    check(missing.length === 0, `Every row the pages show is in searchIndex.json${missing.length ? ` (missing: ${missing.join("; ")}; run pnpm settings:index)` : ""}`);

    await openPage("general");
    await type("会话来源");
    check(hits("agents").includes("会话来源"), "A setting's title finds the setting under its page");
    await pressEnter();
    await wait(120);
    check(current() === "agents", "Enter on a title hit opens its page");
    const found = document.querySelector(".editor-panel .settings-row--found");
    check(text(found?.querySelector(".settings-row__title")) === "会话来源", "…and marks the row it found");

    await type("弹出提醒");
    check(categories().includes("agentAlerts"), "Words written together find a page whose keywords have them apart");
    await type("隐藏已退出的会话");
    check(hits("agents").includes("隐藏已退出的会话"), "A switch's title finds it");
    await type("进程");
    check(hits("agents").includes("隐藏已退出的会话"), "A word of a setting's description finds it");
    await type("zzqxjv");
    check(document.querySelector(".settings-sidebar__empty"), "Nothing found says so");
    await type("hide sessions");
    check(hits("agents").includes("隐藏已退出的会话"), "English words find a setting in the Chinese interface, shown in Chinese");
    await type("外观");
    check(categories().includes("appearance"), "A page's name still finds the page");

    results.textContent = `${messages.join("\n")}\nALL PASS`;
    document.documentElement.dataset.testResult = "passed";
  }
} catch (error) {
  results.textContent = `${messages.join("\n")}\nFAIL ${error instanceof Error ? error.message : String(error)}`;
  document.documentElement.dataset.testResult = "failed";
}
