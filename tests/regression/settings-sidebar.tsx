// pnpm dev, then open /tests/regression/settings-sidebar.html. The settings window's page list on
// its own: search, the folding AI Agent item and About at the bottom. ?page=<category> starts there.
import { act, StrictMode, useState } from "react";
import { createRoot } from "react-dom/client";
import "../../src/styles/tokens.css";
import { I18nProvider, LOCALE_STORAGE_KEY } from "../../src/i18n";
import { SettingsSidebar } from "../../src/windows/settings/SettingsSidebar";
import { settingsCategoryFor, type SettingsCategory } from "../../src/windows/settings/categories";

const savedLocale = localStorage.getItem(LOCALE_STORAGE_KEY);
localStorage.setItem(LOCALE_STORAGE_KEY, "zh-CN");
window.addEventListener("beforeunload", () => {
  if (savedLocale === null) localStorage.removeItem(LOCALE_STORAGE_KEY);
  else localStorage.setItem(LOCALE_STORAGE_KEY, savedLocale);
});
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

let opened: SettingsCategory[] = [];
function Sidebar({ start }: { start: SettingsCategory }) {
  const [category, setCategory] = useState<SettingsCategory>(start);
  return (
    <SettingsSidebar
      category={category}
      onCategoryChange={(next) => {
        opened.push(next);
        setCategory(next);
      }}
    />
  );
}

const messages: string[] = [];
const check = (condition: unknown, message: string) => {
  if (!condition) throw new Error(message);
  messages.push(`PASS ${message}`);
};
const host = document.getElementById("sidebar")!;
const root = createRoot(host);
const mount = (start: SettingsCategory) =>
  act(async () => {
    root.render(<StrictMode><I18nProvider><Sidebar start={start} /></I18nProvider></StrictMode>);
  });
const element = <T extends Element = HTMLElement>(selector: string) => {
  const found = host.querySelector<T>(selector);
  if (!found) throw new Error(`Missing ${selector}`);
  return found;
};
const listed = () => [...host.querySelectorAll<HTMLElement>(".settings-sidebar__item")].map((item) => item.dataset.category!);
const folder = () => element<HTMLButtonElement>(".settings-sidebar__folder");
const search = () => element<HTMLInputElement>(".settings-sidebar__search input");
const type = async (value: string) => {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
  await act(async () => { setter.call(search(), value); search().dispatchEvent(new Event("input", { bubbles: true })); });
};
const press = (key: string) => act(async () => { search().dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true })); });

try {
  await mount(settingsCategoryFor(new URLSearchParams(location.search).get("page") ?? "") ?? "general");
  if (new URLSearchParams(location.search).has("page")) throw "manual";

  check(folder().getAttribute("aria-expanded") === "false" && !listed().includes("agentAlerts"),
    "The AI Agent pages start folded when the window opens elsewhere");
  check(host.querySelector(".settings-sidebar__footer [data-category='about']"), "About is pinned below the page list");
  check(element(".settings-sidebar__item--active").dataset.category === "general", "The open page is marked");

  await type("蓝牙");
  check(listed().join() === "general", "Searching a keyword lists only the pages that have it");
  await type("音效");
  check(listed().join() === "sounds" && folder().disabled, "Search also finds folded pages");
  await press("Enter");
  check(opened[opened.length - 1] === "sounds" && element(".settings-sidebar__item--active").dataset.category === "sounds", "Enter opens the first match");
  await type("不存在的设置");
  check(listed().length === 0 && host.querySelector(".settings-sidebar__empty"), "A search with no match says so");
  await press("Escape");
  check(search().value === "" && listed().includes("about"), "Escape clears the search");
  check(listed().filter((item) => item.startsWith("agent") || item === "sounds").join() === "sounds",
    "Folded, AI Agent keeps the open page listed");
  await act(async () => { folder().click(); });
  check(folder().getAttribute("aria-expanded") === "true" && listed().includes("agentApprovals"), "Clicking AI Agent unfolds its pages");

  await act(async () => { root.render(null); });
  opened = [];
  await mount("agentConnect");
  check(folder().getAttribute("aria-expanded") === "true", "Opening on an AI Agent page starts it unfolded");
  document.documentElement.dataset.testResult = "passed";
} catch (error) {
  if (error !== "manual") {
    document.documentElement.dataset.testResult = "failed";
    messages.push(`FAIL ${String(error)}`);
    console.error(error);
  }
} finally {
  document.getElementById("results")!.textContent = messages.join("\n");
}
