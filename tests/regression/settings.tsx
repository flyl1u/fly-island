// pnpm dev, then open /tests/regression/settings.html. Without ?test=1 the page is for visual QA:
// ?page=<category> opens that page, ?locale=en switches the language.
// ?test=1 runs the checks below; resize the viewport to 580px wide to cover the narrowest window.
import { act, StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "../../src/styles/tokens.css";
import "../../src/styles/fonts.css";
import "../../src/styles/base.css";
import { SettingsWindow } from "../../src/windows/settings/SettingsWindow";
import { DEFAULT_SETTINGS } from "../../src/features/appearance/settings";
import { settingsCategoryFor } from "../../src/windows/settings/categories";
import { I18nProvider, LOCALE_STORAGE_KEY } from "../../src/i18n";
import { commands, mailCalls, REPLY_MARKER, replyMarkerCalls } from "./settingsMocks";

const query = new URLSearchParams(location.search);
const automated = query.has("test");
Object.assign(globalThis, { isTauri: true, IS_REACT_ACT_ENVIRONMENT: automated });
const original = new Map(Object.entries(localStorage).filter(([key]) => key.startsWith("focusd-island-")));
const restore = () => {
  for (const key of Object.keys(localStorage).filter(key => key.startsWith("focusd-island-"))) {
    if (!original.has(key)) localStorage.removeItem(key);
  }
  for (const [key, value] of original) localStorage.setItem(key, value);
};
window.addEventListener("beforeunload", restore);

localStorage.setItem(LOCALE_STORAGE_KEY, query.get("locale") === "en" ? "en" : "zh-CN");
// The checks below expect a customized look plus a General page choice that a reset must keep.
if (automated) localStorage.setItem("focusd-island-settings", JSON.stringify({ opacity: 60, carryOverIncompleteTodos: false }));
else localStorage.removeItem("focusd-island-settings");
localStorage.setItem("focusd-island-save-directory", "");
localStorage.setItem("focusd-island-qq-notification-access-requested", "true");


const root = createRoot(document.getElementById("root")!);
const mount = () => root.render(<StrictMode><I18nProvider><SettingsWindow /></I18nProvider></StrictMode>);
const messages: string[] = [];
const check = (condition: unknown, message: string) => {
  if (!condition) throw new Error(message);
  messages.push(`PASS ${message}`);
};
const element = <T extends HTMLElement>(selector: string) => {
  const found = document.querySelector<T>(selector);
  if (!found) throw new Error(`Missing ${selector}`);
  return found;
};
const click = async (selector: string) => {
  const target = element<HTMLButtonElement>(selector);
  await act(async () => { target.click(); });
};
/** Types into a controlled input the way a user would, so React sees the change. */
const type = async (input: HTMLInputElement, value: string) => {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
  await act(async () => { setter.call(input, value); input.dispatchEvent(new Event("input", { bubbles: true })); });
};
const openPage = (category: string) => click(`.settings-sidebar__item[data-category='${category}']`);
const categories = () =>
  [...document.querySelectorAll<HTMLElement>(".settings-sidebar__item")].map(item => item.dataset.category!);

if (!automated) {
  mount();
  // Old names of merged pages (qq, wechat, mail) open the page they became.
  const page = settingsCategoryFor(query.get("page") ?? "");
  const openRequestedPage = () => {
    const item = document.querySelector<HTMLButtonElement>(`.settings-sidebar__item[data-category='${page}']`);
    if (!item) {
      setTimeout(openRequestedPage, 20);
      return;
    }
    item.click();
  };
  if (page) openRequestedPage();
} else {
  try {
    await act(async () => { mount(); });
    check(categories().length > 0, "The sidebar lists the settings pages");

    for (const category of categories()) {
      await openPage(category);
      const item = element(`.settings-sidebar__item[data-category='${category}']`);
      const panel = element(".editor-panel");
      check(item.getAttribute("aria-current") === "page", `${category}: the sidebar marks the open page`);
      check(element(".settings-page__title").textContent === item.textContent, `${category}: the page title matches the sidebar`);
      check(panel.querySelector(".settings-group, .settings-section"), `${category}: the page has content`);
      check(panel.scrollWidth <= panel.clientWidth, `${category}: nothing overflows horizontally`);
    }


    const storedSettings = () => JSON.parse(localStorage.getItem("focusd-island-settings") ?? "{}") as { opacity?: number; carryOverIncompleteTodos?: boolean };
    check(!document.querySelector(".appearance-reset"), "Reset appearance is not offered outside the appearance page");
    await openPage("appearance");
    await click(".appearance-reset");
    check(storedSettings().opacity === 60, "The first reset click only asks for confirmation");
    await click(".appearance-reset__confirm .appearance-reset:not(.appearance-reset--danger)");
    check(storedSettings().opacity === 60 && document.querySelector(".appearance-reset"), "Cancelling keeps the appearance");
    await click(".appearance-reset");
    await click(".appearance-reset--danger");
    check(storedSettings().opacity === DEFAULT_SETTINGS.opacity, "Confirming resets the appearance");
    check(storedSettings().carryOverIncompleteTodos === false, "Resetting the appearance keeps todo settings");
    check(!document.querySelector(".island-preview__island--glass") && ![...document.querySelectorAll<HTMLButtonElement>(".editor-panel button")].some((button) => button.textContent === "液态玻璃"),
      "Liquid glass is paused: the preview stays classic and the choice is not offered");
    check(document.querySelectorAll("[title]").length === 0, "No hover tooltips anywhere in Settings");

    await openPage("general");
    const tuckedHover = [...document.querySelectorAll<HTMLElement>(".settings-row")].find((row) => row.querySelector(".settings-row__title")?.textContent === "鼠标移到隐藏的岛上");
    const tuckedHoverButton = (label: string) => [...(tuckedHover?.querySelectorAll<HTMLButtonElement>("button") ?? [])].find((button) => button.textContent === label);
    check(tuckedHoverButton("只露出岛屿")?.getAttribute("aria-pressed") === "true", "Hovering a tucked island only slides it out by default");
    await act(async () => { tuckedHoverButton("展开面板")?.click(); });
    check((JSON.parse(localStorage.getItem("focusd-island-settings") ?? "{}") as { tuckedHoverAction?: string }).tuckedHoverAction === "expand"
      && tuckedHoverButton("展开面板")?.getAttribute("aria-pressed") === "true",
      "Choosing to open the panel from a tucked island is saved");
    check(tuckedHover && tuckedHover.scrollWidth <= tuckedHover.clientWidth, "The tucked-hover choice fits its row");
    const detachedRow = [...document.querySelectorAll<HTMLElement>(".settings-row")].find((row) => row.querySelector(".settings-row__title")?.textContent === "独立设置窗口");
    const detachedSwitch = detachedRow?.querySelector<HTMLInputElement>("[role='switch']");
    check(detachedSwitch && !detachedSwitch.checked, "Settings start embedded in the island; General offers a separate window");
    await act(async () => { detachedSwitch!.click(); });
    check(localStorage.getItem("focusd-island-detached-settings") === "true" && detachedSwitch!.checked && !commands.includes("dock_settings_window"),
      "Choosing the separate window is saved on its own");
    await act(async () => { detachedSwitch!.click(); });
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 20)); });
    check(localStorage.getItem("focusd-island-detached-settings") === "false" && commands.includes("dock_settings_window"),
      "Switching it off from the window moves settings back into the island");

    const agentPolls = () => commands.filter(command => command === "get_agent_status").length;
    const pollsAway = agentPolls();
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 1_200)); });
    check(agentPolls() === pollsAway, "Agent status is not polled while its page is closed");

    await act(async () => {
      localStorage.setItem("focusd-island-settings-focus", JSON.stringify({ section: "savePath", requestedAt: Date.now() }));
      window.dispatchEvent(new StorageEvent("storage", { key: "focusd-island-settings-focus", newValue: "x", storageArea: localStorage }));
    });
    check(element(".settings-sidebar__item[data-category='todos']").getAttribute("aria-current") === "page", "A save path request from the island opens the todos page");
    check(document.querySelector(".editor-panel .save-path-panel--attention"), "A save path request from the island highlights the save path");
    await click(".save-path-panel .settings-link-button");
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 1_500)); });
    check(document.querySelector(".save-path-panel .save-path-saved"), "The saved confirmation stays long enough to notice");

    await openPage("messages");
    const rows = () => [...document.querySelectorAll<HTMLElement>(".mail-settings__account")];
    check(rows().length === 2 && rows()[0].textContent?.includes("demo@qq.com"), "The mail page lists every mailbox");
    const rowButton = (row: number, text: string) => [...rows()[row].querySelectorAll<HTMLButtonElement>("button")].find((button) => button.textContent?.includes(text));
    await act(async () => { rowButton(1, "重新授权")!.click(); });
    const formEmail = () => element<HTMLInputElement>(".mail-settings__form input[type='email']");
    check(formEmail().value === "louis@163.com" && formEmail().disabled && !document.querySelector(".mail-settings__form input[type='text']"),
      "Re-authorizing fixes the address and hides the server field");
    await act(async () => { [...document.querySelectorAll<HTMLButtonElement>(".mail-settings__form button")].find((button) => button.textContent === "取消")!.click(); });
    await act(async () => { rowButton(0, "断开")!.click(); });
    check(!mailCalls.some((call) => call.command === "disconnect_qq_mail") && document.querySelector(".mail-settings__confirm"), "The first disconnect click only asks for confirmation");
    await act(async () => { rowButton(0, "确认断开")!.click(); });
    check(mailCalls.some((call) => call.command === "disconnect_qq_mail" && call.args.email === "demo@qq.com") && rows().length === 1,
      "Confirming disconnects and removes the mailbox");
    await type(formEmail(), "new@example.edu.cn");
    await type(element<HTMLInputElement>(".mail-settings__form input[type='password']"), "code");
    await type(element<HTMLInputElement>(".mail-settings__form input[type='text']"), "imap.example.edu.cn");
    await act(async () => { element<HTMLButtonElement>(".mail-settings__form button[type='submit']").click(); });
    check(mailCalls.some((call) => call.command === "connect_qq_mail" && call.args.host === "imap.example.edu.cn") && rows().length === 2,
      "Adding a mailbox sends the typed server and lists it");
    const saved = JSON.parse(localStorage.getItem("focusd-island-qq-mail-settings") ?? "{}") as { accounts?: { email: string; host: string }[] };
    check(saved.accounts?.some((account) => account.email === "new@example.edu.cn" && account.host === "imap.example.edu.cn"),
      "The typed server is saved with the mailbox");

    // AI Agent has its own group: sessions, alerts, sounds, approvals and the hooks each on a page.
    const agentGroup = [...document.querySelectorAll<HTMLElement>(".settings-sidebar__group")].find((group) => group.getAttribute("aria-label") === "AI Agent");
    check([...(agentGroup?.querySelectorAll(".settings-sidebar__item") ?? [])].map((item) => item.textContent).join("|") === "会话|提醒|声音|审批|连接", "AI Agent is its own sidebar group with sessions, alerts, sounds, approvals and connection");
    await openPage("agentConnect");
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 50)); });
    check(agentPolls() > pollsAway, "The connection page reads the agents' state");
    const connectGroups = [...document.querySelectorAll<HTMLElement>(".settings-group")];
    const markerGroup = connectGroups.find((group) => group.textContent?.includes("回复状态标记"));
    check(markerGroup && connectGroups[connectGroups.indexOf(markerGroup) - 1]?.textContent?.includes("安装/修复") && markerGroup.textContent!.includes("推荐打开"),
      "The reply status marker follows the hooks on the connection page and is marked as recommended");
    const markerSwitch = markerGroup?.querySelector<HTMLInputElement>("[role='switch']");
    check(markerSwitch && !markerSwitch.checked && markerGroup!.textContent!.includes(REPLY_MARKER.path) && markerGroup!.querySelector("pre")?.textContent === REPLY_MARKER.content,
      "The reply status marker is off by default and shows the rules file and the text it would write");
    await act(async () => { markerSwitch!.click(); });
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 20)); });
    check(replyMarkerCalls.join() === "true" && markerSwitch!.checked, "Switching the reply status marker on writes it");

    await openPage("agents"); await act(async () => { await new Promise(resolve => setTimeout(resolve, 50)); });
    const hooksLink = [...document.querySelectorAll<HTMLButtonElement>(".editor-panel .settings-link-button")].find((button) => button.textContent === "安装/修复");
    check(hooksLink, "Without hooks, the sessions page says so with a way to install them");
    await act(async () => { hooksLink!.click(); });
    check(element(".settings-sidebar__item[data-category='agentConnect']").getAttribute("aria-current") === "page", "The hooks notice on the sessions page opens the connection page");
    await openPage("agents");
    const filterGroup = () => [...document.querySelectorAll<HTMLElement>(".settings-group")].find((group) => group.textContent?.includes("隐藏会话"))!;
    localStorage.removeItem("focusd-island-agent-session-filters");
    const filterInput = filterGroup().querySelector<HTMLInputElement>(".session-filter__form input")!;
    await type(filterInput, "E:\\Projects\\scratch");
    await act(async () => { filterGroup().querySelector<HTMLFormElement>(".session-filter__form")!.requestSubmit(); });
    const savedFilters = JSON.parse(localStorage.getItem("focusd-island-agent-session-filters") ?? "[]") as { kind: string; value: string }[];
    check(savedFilters.length === 1 && savedFilters[0].kind === "folder" && savedFilters[0].value === "E:\\Projects\\scratch" && filterInput.value === ""
      && filterGroup().querySelector(".session-filter__value")?.textContent === "E:\\Projects\\scratch", "Adding a hide-sessions rule saves and lists it");
    await act(async () => { filterGroup().querySelector<HTMLButtonElement>(".session-filter__remove")!.click(); });
    check(localStorage.getItem("focusd-island-agent-session-filters") === "[]" && !filterGroup().querySelector(".session-filter__value"), "Removing the rule clears it");

    await openPage("about");
    const aboutLink = (label: string) =>
      [...document.querySelectorAll<HTMLButtonElement>(".settings-link-button")].find((button) => button.textContent === label);
    await act(async () => { aboutLink("退出")!.click(); });
    check(commands.includes("quit_island"), "Quit asks the island to exit");

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
}
