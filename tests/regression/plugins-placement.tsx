// Where installed plugins' settings show up, in the real settings window (the long-term rule in
// docs/design/settings.md): a page of their own, a group on a shared page, never the Plugins page.
// pnpm dev, then open /tests/regression/plugins-placement.html?test=1. Without it the page is for visual QA:
// everything is installed and ?page=<category> opens a page; ?locale=en switches the language.
import { act, StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { emit } from "@tauri-apps/api/event";
import "../../src/styles/tokens.css";
import "../../src/styles/fonts.css";
import "../../src/styles/base.css";
import { SettingsWindow } from "../../src/windows/settings/SettingsWindow";
import { I18nProvider, LOCALE_STORAGE_KEY, TRANSLATIONS } from "../../src/i18n";
import { PLUGINS_EVENT, type InstalledPlugin, type PluginManifest } from "../../src/features/plugins/api";
import { DISABLED_NATIVE_PLUGINS_KEY, NATIVE_PLUGINS_KEY } from "../../src/features/plugins/native";
import { pluginMock } from "./settingsMocks";
import eyeCare from "../../plugins/eye-care/fly-island-plugin.json";
import minimax from "../../plugins/minimax/fly-island-plugin.json";
import deviceBattery from "../../plugins/device-battery/fly-island-plugin.json";

Object.assign(globalThis, { isTauri: true, IS_REACT_ACT_ENVIRONMENT: true });
const query = new URLSearchParams(location.search);
const locale = query.get("locale") === "en" ? "en" : "zh-CN";
const original = new Map(Object.entries(localStorage).filter(([key]) => key.startsWith("fly-island-")));
const restore = () => {
  for (const key of Object.keys(localStorage).filter((key) => key.startsWith("fly-island-"))) {
    if (!original.has(key)) localStorage.removeItem(key);
  }
  for (const [key, value] of original) localStorage.setItem(key, value);
};
window.addEventListener("beforeunload", restore);
localStorage.setItem(LOCALE_STORAGE_KEY, locale);
for (const key of [NATIVE_PLUGINS_KEY, DISABLED_NATIVE_PLUGINS_KEY, "fly-island-settings"]) localStorage.removeItem(key);

const t = TRANSLATIONS[locale].settings;
const market = t.plugins.market;
const manifests = [eyeCare, minimax, deviceBattery].map((raw) => ({
  actions: [], ...raw,
  settings: ("settings" in raw ? raw.settings as Record<string, unknown>[] : []).map((setting) => ({ options: [], ...setting })),
})) as unknown as PluginManifest[];
const installed: Record<string, InstalledPlugin> = {};
const actions: string[] = [];
pluginMock.handle = (command, args) => {
  const id = String(args.id);
  if (command === "get_plugins") return structuredClone({ registry: { installed, developerMode: false, indexUrl: "" }, live: {} });
  if (command === "get_plugin_installs") return [];
  if (command === "install_plugin") {
    const manifest = manifests.find((item) => item.id === id)!;
    installed[id] = { manifest, enabled: args.enable === true || installed[id]?.enabled === true, directory: `D:\\plugins\\${id}`, development: false, settings: {} };
    return null;
  }
  if (command === "uninstall_plugin") { delete installed[id]; return null; }
  if (command === "set_plugin_enabled") { installed[id].enabled = Boolean(args.enabled); return null; }
  if (command === "run_plugin_action") { actions.push(`${id}:${String(args.action)}`); return null; }
  if (command === "device_battery_audio") return { OperationSucceeded: true, ConsoleOutputId: "", Error: "", Devices: [] };
  if (command === "device_battery_read") return { devices: [], errors: [] };
  return undefined;
};

const messages: string[] = [];
const check = (condition: unknown, label: string) => {
  if (!condition) throw new Error(label);
  messages.push(`PASS ${label}`);
};
const wait = () => act(async () => { await new Promise((resolve) => setTimeout(resolve, 60)); });
const one = <T extends HTMLElement>(selector: string) => document.querySelector<T>(selector);
const click = async (selector: string) => {
  const target = one<HTMLButtonElement>(selector);
  if (!target) throw new Error(`Missing ${selector}`);
  await act(async () => { target.click(); });
  await wait();
};
const open = (category: string) => click(`.settings-sidebar__item[data-category='${category}']`);
const sidebar = () => [...document.querySelectorAll<HTMLElement>(".settings-sidebar__item[data-category]")].map((item) => item.dataset.category!);
const features = () => {
  const group = one(`.settings-sidebar__group[aria-label='${t.categories.groups.features}']`)!;
  return [...group.querySelectorAll<HTMLElement>("[data-category]")].map((item) => item.dataset.category!);
};
const title = () => one(".settings-page__title")?.textContent;
const group = (id: string) => one(`.editor-panel [data-plugin-group='${id}']`);
const groups = () => [...document.querySelectorAll<HTMLElement>(".editor-panel .settings-group")];
const field = (label: string) => one(`.editor-panel [aria-label='${label}']`);
const label = (manifest: PluginManifest, key: string) => manifest.settings.find((setting) => setting.key === key)!.label[locale];
const byName = (text: (name: string) => string, id: keyof typeof market.items) => `button[aria-label='${text(market.items[id].name)}']`;
const install = (id: keyof typeof market.items) => click(byName(market.installNamed, id));
const uninstall = (id: keyof typeof market.items) => click(byName(market.uninstallNamed, id));
const openSettings = (id: keyof typeof market.items) => click(byName(market.openSettingsNamed, id));
const cardIcon = (id: keyof typeof market.items) => [...document.querySelectorAll<HTMLElement>(".plugin-card")]
  .find((card) => card.querySelector("h3")?.textContent === market.items[id].name)?.querySelector<HTMLElement>(".plugin-card__tile");
/** What the line tiles must share, whichever plugin: size, corners, icon size and stroke, shadow. */
const tileStyle = (tile: HTMLElement) => {
  const style = getComputedStyle(tile);
  const icon = tile.querySelector("svg")!;
  return [style.width, style.height, style.borderRadius, style.boxShadow, icon.getAttribute("width"), icon.getAttribute("stroke-width")].join("|");
};
const fits = (element: Element) => element.scrollWidth <= element.clientWidth + 1;

const root = createRoot(document.getElementById("root")!);
if (!query.has("test")) {
  localStorage.setItem(NATIVE_PLUGINS_KEY, JSON.stringify(["dingtalk", "cursor", "codebuddy", "antigravity", "calendarMarks", "clockWeather"]));
  for (const manifest of manifests) pluginMock.handle("install_plugin", { id: manifest.id, enable: true });
  root.render(<StrictMode><I18nProvider><SettingsWindow /></I18nProvider></StrictMode>);
  const page = query.get("page") ?? "plugins";
  const show = () => {
    const item = one(`.settings-sidebar__item[data-category='${page}']`);
    if (item) item.click(); else setTimeout(show, 50);
  };
  show();
} else try {
  await act(async () => { root.render(<StrictMode><I18nProvider><SettingsWindow /></I18nProvider></StrictMode>); });
  await wait();
  const fixed = features().join();
  check(!sidebar().some((entry) => entry === "devices" || entry === "clockWeather" || entry.startsWith("plugin:")),
    "No plugin pages while nothing is installed");
  await open("plugins");

  const [eyeCareManifest, minimaxManifest] = manifests;
  const period = label(eyeCareManifest, "period");
  await install("eye-care");
  check(features().join() === `${fixed},plugin:eye-care`
    && one(".settings-sidebar__item[data-category='plugin:eye-care']")?.textContent === market.items["eye-care"].name,
    "Eye care gets its own entry, under its name, at the end of Features");
  check(cardIcon("eye-care")?.querySelector("svg.lucide-eye") && one(".settings-sidebar__item[data-category='plugin:eye-care'] svg.lucide-eye"),
    "Eye care has the same line icon on its card and its sidebar entry");
  check(!field(period) && !one(".editor-panel .plugin-group__permissions, .editor-panel input[inputmode='numeric']"),
    "The Plugins page draws none of its settings");
  await openSettings("eye-care");
  check(title() === market.items["eye-care"].name && field(period) && group("eye-care")
    && one(".settings-sidebar__item[data-category='plugin:eye-care']")?.getAttribute("aria-current") === "page",
    "Open settings on the card goes to the plugin's page with its settings");
  check(fits(one(".editor-panel")!) && fits(group("eye-care")!), "The plugin's page does not overflow");

  installed["eye-care"].enabled = false;
  await act(async () => { await emit(PLUGINS_EVENT); });
  await wait();
  check(title() === t.categories.plugins && features().join() === fixed, "Switching it off removes the entry and returns to Plugins");
  await click(`[role=switch][aria-label='${market.enableNamed(market.items["eye-care"].name)}']`);
  check(title() === t.categories.plugins && features().includes("plugin:eye-care"), "Switching it on brings the entry back without leaving Plugins");

  await install("minimax");
  const region = label(minimaxManifest, "region");
  check(sidebar().filter((entry) => entry.startsWith("plugin:")).join() === "plugin:eye-care" && !field(region),
    "An Agent plugin adds no sidebar entry and nothing to the Plugins page");
  await openSettings("minimax");
  check(title() === t.categories.agents && group("minimax")?.querySelector("h2")?.textContent === market.items.minimax.name
    && Boolean(group("minimax")!.querySelector("h2 .plugin-icon--line svg.lucide-sparkles")) && Boolean(field(region)),
    "MiniMax has a group titled with its icon and name on AI sessions");
  const panel = one(".editor-panel")!;
  const offset = group("minimax")!.getBoundingClientRect().top - panel.getBoundingClientRect().top;
  check(offset >= 0 && offset < panel.clientHeight, "Open settings scrolls to the group");

  await open("plugins");
  await install("cursor");
  await open("agents");
  const order = groups().slice(-2).map((item) => item.dataset.pluginGroup).join();
  check(order === "cursor,minimax", "Agent plugin groups follow the built-in groups, in catalog order");
  check(group("cursor")!.textContent?.includes(t.agent.sources.showOnIsland), "A built-in Agent plugin's switch is in its own group");

  await open("agentConnect");
  const connect = group("minimax");
  const hook = minimaxManifest.actions[0];
  check(groups()[groups().length - 1] === connect && connect?.textContent?.includes(hook.label[locale]) && !field(region),
    "MiniMax's connection actions are a group at the end of Connect AI tools");
  await click(`.editor-panel [data-plugin-group='minimax'] button[aria-label='${hook.label[locale]}']`);
  check(actions.join() === `minimax:${hook.id}`, "A plugin action runs from its group");

  await open("plugins");
  await install("dingtalk");
  await openSettings("dingtalk");
  check(title() === t.categories.messages && group("dingtalk")?.querySelector("h2")?.textContent === market.items.dingtalk.name
    && groups()[groups().length - 1] === group("dingtalk"), "A message plugin has its own group at the end of Messages");
  check(!group("telegram"), "Telegram has no Messages group before it is installed");

  await open("plugins");
  await install("telegram");
  await openSettings("telegram");
  check(title() === t.categories.messages && group("telegram")?.querySelector("h2")?.textContent === market.items.telegram.name
    && group("telegram")?.querySelector<HTMLInputElement>("input[role=switch]")?.checked === false
    && localStorage.getItem("fly-island-telegram-notifications-enabled") === null,
    "The Telegram plugin brings its own Messages group, with receiving off until switched on");

  await open("plugins");
  await install("calendarMarks");
  check(!one(byName(market.openSettingsNamed, "calendarMarks")), "A plugin without settings offers no settings link");

  await install("device-battery");
  check(cardIcon("device-battery")?.querySelector("svg.lucide-battery-medium")
    && one(".settings-sidebar__item[data-category='devices'] svg.lucide-battery-medium"), "Device battery has a battery icon on its card and entry");
  const lined = (["clockWeather", "calendarMarks", "codebuddy", "antigravity", "minimax", "device-battery", "eye-care"] as const).map((id) => cardIcon(id)!);
  check(lined.every((tile) => tile.classList.contains("plugin-icon--line") && tileStyle(tile) === tileStyle(lined[0])),
    "Every line tile is drawn like Clock & Weather and Calendar Marks");
  check(new Set(lined.map((tile) => getComputedStyle(tile).backgroundColor)).size === lined.length, "Each line tile takes its own accent");
  check(features().filter((entry) => entry === "devices").length === 1 && !sidebar().includes("plugin:device-battery"),
    "Device battery uses the one Devices page");
  await openSettings("device-battery");
  check(title() === market.items["device-battery"].name && document.querySelector(".editor-panel [data-plugin-group='device-battery']")
    && one(".editor-panel")?.textContent?.includes(TRANSLATIONS[locale].deviceBattery.switchOutput), "Its page holds the audio bindings and the plugin's details");
  check([...document.querySelectorAll(".settings-sidebar__item")].every(fits)
    && [...document.querySelectorAll(".settings-sidebar__item")].every((item) => item.getBoundingClientRect().right
      <= one(".settings-sidebar")!.getBoundingClientRect().right + 1), "Long plugin names stay inside the sidebar");

  await open("plugins");
  check(!one(".editor-panel [data-plugin-group], .editor-panel input[type='password'], .editor-panel input[inputmode='numeric']"),
    "With everything installed the Plugins page still holds only cards");
  for (const id of ["eye-care", "minimax", "device-battery", "dingtalk", "telegram", "cursor", "calendarMarks"] as const) await uninstall(id);
  check(features().join() === fixed, "Uninstalling removes the sidebar entries");
  await open("agents");
  check(!group("minimax") && !group("cursor"), "Uninstalling removes the Agent groups");
  await open("agentConnect");
  check(!group("minimax"), "Uninstalling removes the connection group");
  await open("messages");
  check(!group("dingtalk") && !group("telegram"), "Uninstalling removes the message groups");

  await act(async () => root.unmount());
  document.getElementById("results")!.textContent = [...messages, "ALL PASS"].join("\n");
  document.documentElement.dataset.testResult = "passed";
} catch (error) {
  document.getElementById("results")!.textContent = [...messages, `FAIL ${String(error)}`].join("\n");
  document.documentElement.dataset.testResult = "failed";
} finally {
  restore();
}
