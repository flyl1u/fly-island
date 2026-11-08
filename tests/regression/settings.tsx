// pnpm dev, then open /tests/settings.html. Without ?test=1 the page is for visual QA:
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
import { commands, keybindingCalls, mailCalls, marketInstalls, REPLY_MARKER, replyMarkerCalls, revokedPermissions } from "./settingsMocks";

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
/** The texts of the elements a selector finds, joined by "|". */
const texts = (selector: string) => [...document.querySelectorAll(selector)].map((found) => found.textContent ?? "").join("|");
const backButton = () => [...document.querySelectorAll<HTMLButtonElement>("button")].find((button) => button.textContent === "返回插件列表");
const onPluginPage = () => Boolean(backButton());
const backToList = () => act(async () => { backButton()?.click(); });
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

    await openPage("plugins");
    check(/^第三方（\d+）\|内置（\d+）$/.test(texts(".plugins-list__title")), "Installed plugins are grouped, third-party first, then built-in");
    await act(async () => { document.querySelector<HTMLElement>(".plugins-list__grid .plugin-card--openable .plugin-card__title")?.click(); });
    check(onPluginPage(), "Clicking a plugin's card opens its page");
    await backToList();
    const runLine = [...document.querySelectorAll<HTMLElement>(".plugin-card__hint")].find((hint) => hint.textContent?.startsWith("内存"));
    check(runLine?.textContent === "内存 4.0 MB", "A plugin's card shows only the plugin's own memory, without the runtime");
    check(runLine && !runLine.hasAttribute("title"), "The run line has no hover tooltip");
    check([...document.querySelectorAll(".plugin-card__hint")].some((hint) => hint.textContent === "有预发布版本 v1.1.0-beta.1，可在插件设置里选择接收。"), "A plugin with a pre-release in the market says so on its card");
    const syncCard = [...document.querySelectorAll<HTMLElement>(".plugin-card")].find((card) => card.textContent?.includes("待办同步示例"));
    await act(async () => { [...(syncCard?.querySelectorAll<HTMLButtonElement>(".plugin-card__button") ?? [])].find((button) => button.textContent === "设置")?.click(); });
    const sensitiveRows = [...document.querySelectorAll<HTMLElement>(".plugin-detail__sensitive li")];
    const linkRow = sensitiveRows.find((row) => row.textContent?.includes("focusd:// 链接"));
    check(sensitiveRows.length === 2 && linkRow?.querySelector("em")?.textContent === "已允许", "A plugin that lists onUri shows the remembered answer for links next to its sensitive permissions");
    await act(async () => { linkRow?.querySelector("button")?.click(); });
    check(revokedPermissions.includes("uri"), "Revoking the link answer forgets it like a sensitive permission");
    await backToList();

    // The market has its own page.
    await openPage("market");
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 50)); });
    const groupTitles = () => texts(".plugin-market__group-title");
    check(groupTitles() === "可更新（1）|可安装（1）", "Updates come first, then plugins that can be installed");
    check(document.querySelector(".plugin-market__header button")?.getAttribute("aria-label") === "刷新", "Refresh is a small icon button next to the status line");
    const marketItem = [...document.querySelectorAll<HTMLElement>(".plugin-market__item")].find((item) => item.textContent?.includes("待办同步示例"));
    const detailsButton = [...(marketItem?.querySelectorAll<HTMLButtonElement>("button[aria-expanded]") ?? [])][0];
    await act(async () => { detailsButton?.click(); });
    check(marketItem?.querySelector(".plugin-market__doc h3")?.textContent === "待办同步"
      && marketItem.querySelector(".plugin-market__doc strong")?.textContent === "5 分钟"
      && marketItem.querySelector(".plugin-market__doc a")?.getAttribute("href") === "https://example.com/docs"
      && marketItem.querySelectorAll(".plugin-market__doc li").length === 2,
      "The market details render the plugin's README");
    check(marketItem?.querySelector(".plugin-market__history summary")?.textContent === "版本历史"
      && marketItem.querySelector(".plugin-market__history h4")?.textContent === "1.1.0",
      "The market details show the plugin's version history");
    const tags = [...(marketItem?.querySelectorAll<HTMLElement>(".plugin-market__tag--signed") ?? [])];
    check(tags.length === 1 && tags[0].textContent === "作者已签名", "A plugin signed by its author is tagged in the market");
    check(marketItem?.querySelector(".plugin-card__hint--warn")?.textContent?.includes("签名密钥变了"), "An update on another author key says so");
    const marketButton = (label: string) => [...(marketItem?.querySelectorAll<HTMLButtonElement>(".plugin-market__action button") ?? [])].find((item) => item.textContent === label);
    await act(async () => { marketButton("仍然更新")?.click(); });
    check(marketInstalls.length === 0 && marketButton("确认更新") && marketButton("取消"), "Updating on another author key first asks to confirm");
    await act(async () => { marketButton("确认更新")?.click(); });
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 20)); });
    check(marketInstalls.length === 1 && marketInstalls[0].id === "dev.example.todo-sync" && marketInstalls[0].acceptKeyChange === true, "Confirming installs the update and accepts the new key");
    const verifiedBadges = [...document.querySelectorAll<HTMLElement>(".plugin-market__badge:not(.plugin-market__badge--official)")];
    check(verifiedBadges.length === 1 && verifiedBadges[0].textContent === "已验证"
      && verifiedBadges[0].closest(".plugin-market__item")?.textContent?.includes("新插件"),
      "A verified publisher gets a small mark; the official one keeps its own label");
    check(document.querySelectorAll("[title]").length === 0, "No hover tooltips anywhere in Settings");
    const verifiedItem = verifiedBadges[0]?.closest<HTMLElement>(".plugin-market__item");
    check(verifiedItem && verifiedItem.scrollWidth <= verifiedItem.clientWidth, "The verified mark does not make the market overflow");
    // The update above was installed, so the plugin is current now and hidden with the other installed ones.
    check(groupTitles() === "可安装（1）", "Current installed plugins are hidden at first");
    const showInstalled = document.querySelector<HTMLButtonElement>(".plugin-market__toggle");
    check(showInstalled?.textContent?.startsWith("显示已安装的插件（"), "A link offers the installed plugins with their count");
    await act(async () => { showInstalled?.click(); });
    check(groupTitles() === "可安装（1）|已安装（1）" && showInstalled?.textContent === "隐藏已安装的插件"
      && document.querySelectorAll(".plugin-market__grid").length === 2, "Showing them adds the installed group last, cards in a grid");
    check(document.querySelector(".plugin-market__status")?.textContent?.startsWith("共 ") && !document.querySelector(".plugin-market__header > span:only-child"), "A status line with the plugin count takes the place of a second Plugin market title");
    const officialBadges = document.querySelectorAll(".plugin-market__badge--official");
    check(officialBadges.length > 0 && [...document.querySelectorAll(".plugin-market__meta")].every((meta) => !meta.textContent?.includes("· 官方")), "Official plugins carry one small mark instead of a publisher line");
    check([...document.querySelectorAll<HTMLElement>(".plugin-market__icon")].every((icon) => icon.textContent?.length === 1), "Every market card has a one-letter icon");
    const installedItem = document.querySelector<HTMLElement>(".plugin-market__installed")?.closest<HTMLElement>(".plugin-market__item");
    const manage = [...(installedItem?.querySelectorAll<HTMLButtonElement>(".plugin-market__action button") ?? [])].find((button) => button.textContent === "管理");
    const managedName = installedItem?.querySelector(".plugin-market__title strong")?.textContent ?? "";
    await act(async () => { manage?.click(); });
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 20)); });
    check(Boolean(manage) && onPluginPage()
      && document.body.textContent?.includes(managedName),
      "An installed plugin shows Installed with Manage, which opens it on the plugins page");
    await backToList();

    await openPage("shortcuts");
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 50)); });
    const pluginRows = [...document.querySelectorAll<HTMLElement>(".shortcut-row")].filter((row) => row.textContent?.includes(" · "));
    const syncRow = pluginRows.find((row) => row.textContent?.includes("立即同步 · 待办同步示例"));
    const tokenRow = pluginRows.find((row) => row.textContent?.includes("重新生成令牌 · 本地接口"));
    check(syncRow?.querySelector(".shortcut-control__meta strong")?.textContent === "Ctrl+Alt+S" && !tokenRow, "Settings > Shortcuts lists the commands of third-party plugins that are on, with the manifest's shortcut; built-in ones are left out");
    await act(async () => { syncRow?.querySelector<HTMLButtonElement>("button[aria-label^='关闭这个快捷键']")?.click(); });
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 20)); });
    check(keybindingCalls.length === 1 && keybindingCalls[0].id === "dev.example.todo-sync" && keybindingCalls[0].command === "sync-now" && keybindingCalls[0].keybinding === "",
      "Turning a plugin shortcut off saves an empty shortcut for that command");

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
    check(!document.querySelector(".island-preview__island--glass"), "The island preview starts classic");
    const glassButton = [...document.querySelectorAll<HTMLButtonElement>(".editor-panel button")].find((button) => button.textContent === "液态玻璃");
    await act(async () => { glassButton!.click(); });
    check(document.querySelectorAll(".island-preview__island--glass").length === 2, "Choosing liquid glass shows on both preview islands");

    await openPage("general");
    const tuckedHover = [...document.querySelectorAll<HTMLElement>(".settings-row")].find((row) => row.querySelector(".settings-row__title")?.textContent === "鼠标移到隐藏的岛上");
    const tuckedHoverButton = (label: string) => [...(tuckedHover?.querySelectorAll<HTMLButtonElement>("button") ?? [])].find((button) => button.textContent === label);
    check(tuckedHoverButton("只露出岛屿")?.getAttribute("aria-pressed") === "true", "Hovering a tucked island only slides it out by default");
    await act(async () => { tuckedHoverButton("展开面板")?.click(); });
    check((JSON.parse(localStorage.getItem("focusd-island-settings") ?? "{}") as { tuckedHoverAction?: string }).tuckedHoverAction === "expand"
      && tuckedHoverButton("展开面板")?.getAttribute("aria-pressed") === "true",
      "Choosing to open the panel from a tucked island is saved");
    check(tuckedHover && tuckedHover.scrollWidth <= tuckedHover.clientWidth, "The tucked-hover choice fits its row");

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
    check([...(agentGroup?.querySelectorAll(".settings-sidebar__item") ?? [])].map((item) => item.textContent).join("|") === "会话|提醒|声音|审批|连接|SSH 远程", "AI Agent is its own sidebar group with sessions, alerts, sounds, approvals, connection and SSH remote");
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

    await openPage("agentRemote"); await act(async () => { await new Promise(resolve => setTimeout(resolve, 50)); });
    check(/devbox.*nas/s.test(element(".editor-panel").textContent ?? ""), "The remote computers page lists the SSH hosts to read sessions from");
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
    await act(async () => { aboutLink("重置")!.click(); });
    check(aboutLink("确认重置") && aboutLink("取消"), "Reset all settings asks first");
    // The appearance reset above kept the todo setting, so it is the one that shows a full reset.
    check(storedSettings().carryOverIncompleteTodos === false, "Asking changes nothing yet");
    await act(async () => { aboutLink("确认重置")!.click(); });
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 20)); });
    check(storedSettings().carryOverIncompleteTodos === DEFAULT_SETTINGS.carryOverIncompleteTodos && !aboutLink("确认重置"),
      "Confirming resets every setting, not just the appearance");
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
