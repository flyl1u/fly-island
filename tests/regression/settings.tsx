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
import { commands, mailCalls, REPLY_MARKER, replyMarkerCalls, translationShortcutCalls } from "./settingsMocks";

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
// Other pages in the same run leave their own agent settings behind; start from the defaults.
localStorage.removeItem("focusd-island-agent-approval");
localStorage.removeItem("focusd-island-agent-sounds");
localStorage.removeItem("focusd-island-detached-settings");
// The player order as the old Music page saved it.
localStorage.setItem("focusd-island-music-sources", JSON.stringify([{ id: "Spotify.exe", label: "Spotify" }, { id: "QQMusic", label: "QQ音乐" }]));


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
      // Settings stay short: a handful of rows per page (Messages lists mailboxes, so it is left out).
      // General has one more for the auto-collapse delay the owner asked for (2026-11-11).
      const rowCount = panel.querySelectorAll(".settings-row").length;
      const maxRows = category === "general" ? 9 : 8;
      check(category === "messages" || rowCount <= maxRows, `${category}: the page keeps to a handful of rows (${rowCount})`);
    }
    check(settingsCategoryFor("sounds") === "agents" && settingsCategoryFor("agentAlerts") === "agents" && settingsCategoryFor("agentApprovals") === "agents"
      && settingsCategoryFor("shelf") === "clipboard", "Old names of merged pages open the page they became");


    const storedSettings = () => JSON.parse(localStorage.getItem("focusd-island-settings") ?? "{}") as { opacity?: number; carryOverIncompleteTodos?: boolean };
    check(!document.querySelector(".appearance-reset"), "Reset appearance is not offered outside the appearance page");
    await openPage("appearance");
    // Expanded size: a slider from 0.85x to 1.2x, stored as the scale once the thumb is let go,
    // and the island opens to show it.
    const sizeLabel = [...document.querySelectorAll<HTMLLabelElement>("label")].find((label) => label.textContent === "展开后的大小");
    const sizeSlider = element<HTMLInputElement>(`#${CSS.escape(sizeLabel?.htmlFor ?? "missing")}`);
    const storedScale = () => (JSON.parse(localStorage.getItem("focusd-island-settings") ?? "{}") as { expandedScale?: number }).expandedScale;
    const previewIsland = element<HTMLElement>(".island-preview__island--expanded");
    const previewWidth = () => previewIsland.getBoundingClientRect().width;
    const originalPreviewWidth = previewWidth();
    check(sizeSlider.type === "range" && sizeSlider.min === "0.85" && sizeSlider.max === "1.2" && sizeSlider.step === "0.01" && sizeSlider.value === "1",
      "The expanded size is a slider from 0.85 to 1.2 in steps of 0.01, at 1 by default");
    localStorage.removeItem("focusd-island-panel-preview");
    const setRange = (input: HTMLInputElement, value: string) => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(input, value);
      input.dispatchEvent(new Event("input", { bubbles: true }));
    };
    await act(async () => { setRange(sizeSlider, "1.05"); });
    await act(async () => { setRange(sizeSlider, "1.12"); });
    const sizeRow = sizeSlider.closest(".settings-row") ?? document.body;
    check(storedScale() !== 1.12 && !localStorage.getItem("focusd-island-panel-preview") && sizeRow.querySelector(".settings-slider__value")?.textContent === "1.12x",
      "Dragging the expanded size shows the value but neither stores it nor resizes the island yet");
    check(Math.abs(previewWidth() / originalPreviewWidth - 1.12) < 0.01,
      "The drawing above the slider follows the unsaved size in real time");
    await act(async () => { window.dispatchEvent(new PointerEvent("pointerup")); });
    const preview = JSON.parse(localStorage.getItem("focusd-island-panel-preview") ?? "{}") as { mode?: string };
    check(storedScale() === 1.12 && preview.mode === "expanded", "Letting go stores 1.12 and opens the island to show it");
    await act(async () => { setRange(sizeSlider, "1"); });
    await act(async () => { sizeSlider.dispatchEvent(new KeyboardEvent("keyup", { bubbles: true })); });
    check(storedScale() === 1, "A key press on the slider stores its value at once");
    check(Math.abs(previewWidth() - originalPreviewWidth) < 1, "Committing the original size clears the temporary preview");
    await act(async () => { setRange(sizeSlider, "1.2"); });
    const previewBox = previewIsland.parentElement!.getBoundingClientRect();
    const largest = previewIsland.getBoundingClientRect();
    check(largest.left >= previewBox.left && largest.right <= previewBox.right && largest.bottom <= previewBox.bottom,
      "The largest size stays fully visible inside the preview");
    await act(async () => { sizeRow.querySelector<HTMLButtonElement>(".settings-slider__reset")!.click(); });
    check(sizeSlider.value === "1" && Math.abs(previewWidth() - originalPreviewWidth) < 1,
      "Reset clears the unsaved size as well as the slider");
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
    const generalTitles = [...document.querySelectorAll<HTMLElement>(".editor-panel .settings-row__title")].map((title) => title.textContent);
    check(generalTitles.includes("展开方式") && generalTitles.includes("闲置时贴边隐藏") && !generalTitles.includes("鼠标移到隐藏的岛上") && !generalTitles.includes("显示在"),
      "General keeps opening and tucking; hover timings, the monitor and game mode are gone");
    const detachedRow = [...document.querySelectorAll<HTMLElement>(".settings-row")].find((row) => row.querySelector(".settings-row__title")?.textContent === "独立设置窗口");
    const detachedSwitch = detachedRow?.querySelector<HTMLInputElement>("[role='switch']");
    check(detachedSwitch?.checked && !commands.includes("dock_settings_window"), "Settings start in a separate window by default");
    await act(async () => { detachedSwitch!.click(); });
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 20)); });
    check(localStorage.getItem("focusd-island-detached-settings") === "false" && commands.includes("dock_settings_window"),
      "Switching it off from the window moves settings back into the island");
    await act(async () => { detachedSwitch!.click(); });
    check(localStorage.getItem("focusd-island-detached-settings") === "true" && detachedSwitch!.checked,
      "Choosing the separate window is saved on its own");
    const lockRow = [...document.querySelectorAll<HTMLElement>(".settings-row")].find((row) => row.querySelector(".settings-row__title")?.textContent === "锁定小岛位置");
    const lockSwitch = lockRow?.querySelector<HTMLInputElement>("[role='switch']");
    check(lockSwitch && !lockSwitch.checked, "The island position is unlocked by default");
    await act(async () => { lockSwitch!.click(); });
    await openPage("appearance");
    await openPage("general");
    check((JSON.parse(localStorage.getItem("focusd-island-settings") ?? "{}") as { positionLocked?: boolean }).positionLocked === true
      && [...document.querySelectorAll<HTMLElement>(".settings-row")].find((row) => row.textContent?.includes("锁定小岛位置"))?.querySelector<HTMLInputElement>("[role='switch']")?.checked,
      "Locking the position is saved and stays on after changing pages");

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

    // AI Agent has its own group: sessions and alerts on one page, the hooks on the other.
    const agentGroup = [...document.querySelectorAll<HTMLElement>(".settings-sidebar__group")].find((group) => group.getAttribute("aria-label") === "AI Agent");
    check([...(agentGroup?.querySelectorAll(".settings-sidebar__item") ?? [])].map((item) => item.textContent).join("|") === "会话与提醒|连接", "AI Agent is its own sidebar group with two pages: sessions and alerts, connection");
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
    const agentRow = (title: string) => [...document.querySelectorAll<HTMLElement>(".editor-panel .settings-row")].find((row) => row.querySelector(".settings-row__title")?.textContent === title);
    check(!document.querySelector(".session-filter__form"), "Hide-session rules are no longer offered");
    const soundSwitch = agentRow("AI Agent 音效")?.querySelector<HTMLInputElement>("[role='switch']");
    check(soundSwitch?.checked, "Agent sounds are a single switch on the sessions page, on by default");
    await act(async () => { soundSwitch!.click(); });
    check((JSON.parse(localStorage.getItem("focusd-island-agent-sounds") ?? "{}") as { enabled?: boolean }).enabled === false, "Switching agent sounds off is saved");
    const approvalSwitch = agentRow("在岛上允许或拒绝 Agent 的操作")?.querySelector<HTMLInputElement>("[role='switch']");
    check(approvalSwitch && !approvalSwitch.checked, "Approving on the island sits on the sessions page, off by default");

    // Settings → Music → Player order: the saved order, new players added after it, each one's
    // state, and moving a row saves the old format.
    await openPage("music"); await act(async () => { await new Promise(resolve => setTimeout(resolve, 50)); });
    const players = () => [...document.querySelectorAll<HTMLElement>(".reorder-list__item")].map((row) => row.querySelector(".reorder-list__name")?.textContent);
    const hints = [...document.querySelectorAll<HTMLElement>(".reorder-list__hint")].map((hint) => hint.textContent);
    check(players().join() === "Spotify,QQ音乐,网易云音乐" && hints.join() === "没有打开,已打开,正在播放",
      `The Music page lists the saved player order, then newly seen players, with their state (${players().join()} / ${hints.join()})`);
    await act(async () => {
      document.querySelectorAll<HTMLElement>(".reorder-list__handle")[2].dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowUp", bubbles: true }));
    });
    const savedPlayers = JSON.parse(localStorage.getItem("focusd-island-music-sources") ?? "[]") as { id: string; label: string }[];
    check(players().join() === "Spotify,网易云音乐,QQ音乐" && savedPlayers.map((source) => source.id).join() === "Spotify.exe,cloudmusic.exe,QQMusic"
      && savedPlayers[1].label === "网易云音乐", "Moving a player saves the order in the same key and format");

    // Shortcuts: the recorder reads the physical key (Shift+1 gives "!" and Chinese input
    // gives "Process"), and another part of the page saving later keeps the new keys.
    const record = async (init: KeyboardEventInit) => {
      const button = element<HTMLButtonElement>(".editor-panel .shortcut-record-button");
      await act(async () => { button.focus(); button.click(); });
      await act(async () => { button.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, cancelable: true, ...init })); });
      await act(async () => { await new Promise(resolve => setTimeout(resolve, 20)); });
    };
    const storedShortcut = () => (JSON.parse(localStorage.getItem("focusd-island-translation-settings") ?? "{}") as { shortcut?: string }).shortcut;
    await openPage("translation");
    await record({ key: "!", code: "Digit1", ctrlKey: true, shiftKey: true });
    check(translationShortcutCalls[translationShortcutCalls.length - 1] === "Ctrl+Shift+1" && storedShortcut() === "Ctrl+Shift+1",
      "Recording Ctrl+Shift+1 registers and saves Ctrl+Shift+1, not the shifted symbol");
    await record({ key: "Process", code: "KeyJ", ctrlKey: true, altKey: true });
    check(storedShortcut() === "Ctrl+Alt+J", "Keys pressed with Chinese input on record by their physical key");
    await type(element<HTMLInputElement>(".editor-panel input[placeholder*='模型']"), "demo-model");
    check(storedShortcut() === "Ctrl+Alt+J" && element(".editor-panel .shortcut-record-button").textContent === "Ctrl+Alt+J",
      "Editing the model afterwards keeps the new translation shortcut");
    await openPage("clipboard");
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 20)); });
    await record({ key: "?", code: "Slash", ctrlKey: true, shiftKey: true });
    const clipboardSaved = commands.lastIndexOf("set_clipboard_history_settings") >= 0;
    check(clipboardSaved && element(".editor-panel .shortcut-record-button").textContent === "Ctrl+Shift+/",
      "Recording Ctrl+Shift+/ for clipboard history saves it");
    await record({ key: "J", code: "KeyJ", ctrlKey: true, altKey: true });
    check(element(".shortcut-control__error").textContent?.includes("Ctrl+Alt+J"), "Keys translation already uses are refused for clipboard history");

    await openPage("about");
    // About: one group holds the latest version (with its update states) and the links; no
    // separate Version group nests a box in a box.
    const aboutCards = [...document.querySelectorAll<HTMLElement>(".settings-group__card")];
    const linkCard = aboutCards.find((card) => card.querySelector(".project-link"));
    const linkTitles = [...(linkCard?.querySelectorAll<HTMLElement>(".project-link__copy strong") ?? [])].map((title) => title.textContent);
    check(linkTitles.join() === "查看最新版本,历史版本,反馈问题,觉得小岛还不错？,关于作者,打赏作者",
      `About lists the update row and the links in one group (${linkTitles.join()})`);
    check(![...document.querySelectorAll(".settings-group__title")].some((title) => title.textContent === "版本"), "About has no separate Version group");
    const authorLink = [...(linkCard?.querySelectorAll<HTMLAnchorElement>("a.project-link") ?? [])].find((link) => link.textContent?.includes("关于作者"));
    check(authorLink?.href === "https://flyliu.org/", "About the author opens flyliu.org");
    const historyLink = [...(linkCard?.querySelectorAll<HTMLAnchorElement>("a.project-link") ?? [])].find((link) => link.textContent?.includes("历史版本"));
    check(historyLink?.href.endsWith("/releases") === true && historyLink.textContent?.includes("点击之后可以查看岛屿的历史版本和更新历史") === true,
      "History opens every release with its description");
    const supportToggle = element<HTMLButtonElement>(".support-author__toggle");
    check(supportToggle.getAttribute("aria-expanded") === "false" && !document.querySelector(".support-author__code"),
      "Support the author starts closed");
    await act(async () => { supportToggle.click(); });
    const codes = [...document.querySelectorAll<HTMLElement>(".support-author__code")];
    check(supportToggle.getAttribute("aria-expanded") === "true"
      && codes.map((code) => code.querySelector("figcaption")?.textContent).join() === "微信,支付宝"
      && codes.every((code) => code.querySelector("img")?.getAttribute("src")?.includes("/assets/donate/")),
      "Clicking Support the author shows the WeChat and Alipay codes bundled with the app");
    await act(async () => { supportToggle.click(); });
    check(!document.querySelector(".support-author__code"), "Clicking it again closes the codes");
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
