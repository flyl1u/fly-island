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
const search = () => element<HTMLInputElement>(".settings-sidebar__search input");
const type = async (value: string) => {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
  await act(async () => { setter.call(search(), value); search().dispatchEvent(new Event("input", { bubbles: true })); });
};
const press = (key: string) => act(async () => { search().dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true })); });

try {
  await mount(settingsCategoryFor(new URLSearchParams(location.search).get("page") ?? "") ?? "general");
  if (new URLSearchParams(location.search).has("page")) throw "manual";

  const groupRows = () => [...host.querySelectorAll<HTMLButtonElement>(".settings-sidebar__folder")];
  const group = (name: string) => element<HTMLButtonElement>(`.settings-sidebar__folder[data-group='${name}']`);
  check(groupRows().map((row) => row.dataset.group).join() === "basics,features,agents,extensions"
    && groupRows().every((row) => row.getAttribute("aria-expanded") === "true"),
    "Every group is a row that folds, and all start unfolded");
  check(listed().length === 17, "Every page is listed at first");
  check(host.querySelector(".settings-sidebar__footer [data-category='about']"), "About is pinned below the page list");
  check(element(".settings-sidebar__item--active").dataset.category === "general", "The open page is marked");

  await act(async () => { group("features").click(); });
  check(group("features").getAttribute("aria-expanded") === "false" && !listed().includes("todos") && listed().includes("agents"),
    "Folding Features hides only its pages");
  await act(async () => { group("basics").click(); });
  check(listed().filter((item) => ["general", "appearance", "shortcuts"].includes(item)).join() === "general",
    "A folded group keeps the open page listed");
  check(group("basics").getAttribute("aria-label") === "展开「基础」", "The row says what clicking it does");

  await type("蓝牙");
  check(listed().join() === "general", "Searching a keyword lists only the pages that have it");
  await type("剪贴");
  check(listed().join() === "clipboard" && group("features").disabled, "Search also finds pages in folded groups");
  await press("Enter");
  check(opened[opened.length - 1] === "clipboard" && element(".settings-sidebar__item--active").dataset.category === "clipboard",
    "Enter opens the first match");
  await type("不存在的设置");
  check(listed().length === 0 && host.querySelector(".settings-sidebar__empty"), "A search with no match says so");
  await press("Escape");
  check(search().value === "" && group("features").getAttribute("aria-expanded") === "false", "Escape clears the search; folded groups stay folded");
  await act(async () => { group("features").click(); });
  await act(async () => { group("basics").click(); });
  check(listed().length === 17, "Unfolding shows the pages again");

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
