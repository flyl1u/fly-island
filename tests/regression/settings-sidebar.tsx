// pnpm dev, then open /tests/regression/settings-sidebar.html. The settings page list on its own:
// groups under fixed headings and About at the bottom. ?page=<category> starts there.
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
try {
  await mount(settingsCategoryFor(new URLSearchParams(location.search).get("page") ?? "") ?? "general");
  if (new URLSearchParams(location.search).has("page")) throw "manual";

  const headings = () => [...host.querySelectorAll<HTMLElement>(".settings-sidebar__heading")].map((heading) => heading.textContent);
  check(headings().join("|") === "基础|功能|AI Agent", "Pages sit under fixed group headings that do not fold");
  check(!host.querySelector("input, button[aria-expanded]"), "No search box and nothing to fold");
  check(listed().join() === "general,appearance,todos,music,translation,clipboard,messages,agents,agentConnect,about",
    "Every page is listed once, in sidebar order");
  check(host.querySelector(".settings-sidebar__footer [data-category='about']"), "About is pinned below the page list");
  check(element(".settings-sidebar__item--active").dataset.category === "general", "The open page is marked");
  await act(async () => { element<HTMLButtonElement>("[data-category='clipboard']").click(); });
  check(opened[opened.length - 1] === "clipboard" && element(".settings-sidebar__item--active").dataset.category === "clipboard"
    && element("[data-category='clipboard']").getAttribute("aria-current") === "page", "Clicking a page opens and marks it");

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
