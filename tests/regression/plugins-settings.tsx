import { act, StrictMode, useState } from "react";
import { createRoot } from "react-dom/client";
import { mockIPC } from "@tauri-apps/api/mocks";
import { emit } from "@tauri-apps/api/event";
import { PluginsSettingsPage } from "../../src/windows/settings/PluginsSettingsPage";
import { SettingsSidebar } from "../../src/windows/settings/SettingsSidebar";
import { PluginPageGroups } from "../../src/windows/settings/PluginSettingsGroup";
import type { PlacedPlugin } from "../../src/features/plugins/placement";
import { I18nProvider, LOCALE_STORAGE_KEY, TRANSLATIONS } from "../../src/i18n";
import { PLUGIN_PROGRESS_EVENT, type InstalledPlugin, type PluginIndexEntry, type PluginInstallProgress, type PluginManifest } from "../../src/features/plugins/api";
import { checkInstallCancel, checkInstallProgress } from "./pluginInstallProgress";
import { checkPluginAuthors } from "./pluginAuthors";
import { PLUGIN_MARKET_ENABLED, PLUGINS_ENABLED } from "../../src/features/releaseFlags.ts";
import { DISABLED_NATIVE_PLUGINS_KEY, NATIVE_PLUGINS, NATIVE_PLUGINS_KEY } from "../../src/features/plugins/native";
import { CLOCK_WEATHER_KEY } from "../../src/features/weather/storage";
import { DEFAULT_SETTINGS } from "../../src/features/appearance/settings";
import type { IslandSettings } from "../../src/features/appearance/types";
import { OFFICE_IM_ENABLED_KEY } from "../../src/features/messages/office-im/storage";
import { MARKET_PACKAGES, PACKAGED_MARKET_PLUGINS } from "../../src/features/plugins/native/catalog";
import eyeCareManifest from "../../plugins/eye-care/fly-island-plugin.json";
import "../../src/styles/tokens.css";
import "../../src/styles/base.css";
import "../../src/windows/settings/LayoutEditor.css";

Object.assign(globalThis, { isTauri: true, IS_REACT_ACT_ENVIRONMENT: true });
const locale = new URLSearchParams(location.search).get("lang") === "en" ? "en" : "zh-CN";
localStorage.setItem(LOCALE_STORAGE_KEY, locale);
const t = TRANSLATIONS[locale].settings.plugins;
const stored = "D:\\CodexBuild\\plugins\\plugins-index.json";
const manifest: PluginManifest = { ...eyeCareManifest, settings: eyeCareManifest.settings.map((s) => ({ ...s, options: s.options ?? [] })) } as PluginManifest;
const eyeCare: InstalledPlugin = { manifest, enabled: true, directory: "D:\\plugins\\eye-care", development: false, settings: {} };
const registry = {
  installed: PLUGINS_ENABLED ? { "eye-care": eyeCare } : {} as Record<string, InstalledPlugin>,
  developerMode: PLUGINS_ENABLED, indexUrl: PLUGINS_ENABLED ? stored : "",
};
const saves: { key: string; value: string }[] = [];
let saveDelay = 0;
const snapshot = () => structuredClone({ registry, live: {} });
const requests: { resolve: (items: PluginIndexEntry[]) => void; reject: (reason: string) => void }[] = [];
let resolveRegistry: (() => void) | undefined;
let opened = "";
let failOpen = false;
let installFailure = "";
let holdInstall = false;
let finishInstall: (() => void) | undefined;
let rejectInstall: ((reason: string) => void) | undefined;
let hostJobs: PluginInstallProgress[] = [];
const hostCalls: string[] = [];
mockIPC((command, payload) => {
  hostCalls.push(command);
  const args = (payload ?? {}) as Record<string, unknown>;
  if (command === "get_plugins") return !PLUGINS_ENABLED || resolveRegistry
    ? snapshot()
    : new Promise((resolve) => { resolveRegistry = () => resolve(snapshot()); });
  if (command === "install_plugin") {
    if (installFailure) throw installFailure;
    const apply = () => { registry.installed["eye-care"] = { ...eyeCare, enabled: args.enable === true }; };
    if (holdInstall) return new Promise((resolve, reject) => {
      finishInstall = () => { apply(); hostJobs = []; resolve(null); };
      rejectInstall = (reason) => { hostJobs = []; reject(reason); };
    });
    apply();
    return null;
  }
  if (command === "get_plugin_installs") return structuredClone(hostJobs);
  if (command === "cancel_plugin_install") { rejectInstall?.("plugin_install_cancelled"); return true; }
  if (command === "set_plugin_enabled") {
    registry.installed["eye-care"].enabled = Boolean(args.enabled);
    return null;
  }
  if (command === "uninstall_plugin") { delete registry.installed["eye-care"]; return null; }
  if (command === "get_plugins_index") return new Promise<PluginIndexEntry[]>((resolve, reject) => requests.push({ resolve, reject }));
  if (command === "configure_plugins") { registry.developerMode = Boolean(args.developerMode); registry.indexUrl = String(args.indexUrl); return null; }
  if (command === "plugin:opener|open_url") {
    if (failOpen) throw new Error("open failed");
    opened = String(args.url); return null;
  }
  if (command === "set_plugin_setting") {
    const key = String(args.key), value = String(args.value);
    saves.push({ key, value });
    return new Promise((resolve) => setTimeout(() => { eyeCare.settings[key] = value; resolve(null); }, saveDelay));
  }
  return null;
}, { shouldMockEvents: true });
const messages: string[] = [];
const openedSettings: PlacedPlugin[] = [];
let latestSettings: IslandSettings = { ...DEFAULT_SETTINGS, agentShowCursor: false, agentShowZcode: false, agentQuotaSources: ["claudeCode"] };
function Page() {
  const [settings, setSettings] = useState(latestSettings);
  return <>
    <SettingsSidebar category="plugins" onCategoryChange={() => {}} />
    <PluginsSettingsPage settings={settings} onSettingsChange={(next) => { latestSettings = next; setSettings(next); }}
      onOpenSettings={(plugin) => { openedSettings.push(plugin); }} />
    {/* The developer build also checks the number settings, on the page eye care declared. */}
    {PLUGINS_ENABLED && <PluginPageGroups page="plugin:eye-care" />}
  </>;
}
function check(condition: unknown, label: string) {
  if (!condition) throw new Error(label);
  messages.push(`PASS ${label}`);
}
const wait = () => act(async () => { await new Promise((resolve) => setTimeout(resolve, 30)); });
const button = (text: string) => [...document.querySelectorAll<HTMLButtonElement>("button")].find((item) => item.textContent === text)!;
const app = createRoot(document.getElementById("fixture")!);
try {
  localStorage.removeItem(NATIVE_PLUGINS_KEY);
  localStorage.removeItem(DISABLED_NATIVE_PLUGINS_KEY);
  localStorage.removeItem(CLOCK_WEATHER_KEY);
  localStorage.setItem(OFFICE_IM_ENABLED_KEY, JSON.stringify({ dingtalk: false, feishu: true, wecom: true }));
  await act(async () => app.render(<StrictMode><I18nProvider><Page /></I18nProvider></StrictMode>)); await wait();
  const batterySidebar = () => document.querySelector("[data-category='battery']");
  check(!batterySidebar() && !hostCalls.includes("get_notebook_battery"), "没装电池插件时没有它的栏目，也不读取电池");
  const cards = [...document.querySelectorAll<HTMLElement>(".plugin-card")];
  if (!PLUGIN_MARKET_ENABLED) {
    check(cards.length === 0, "正式版不显示插件市场");
  } else {
    const market = TRANSLATIONS[locale].settings.plugins.market;
    check(cards.length === NATIVE_PLUGINS.length + PACKAGED_MARKET_PLUGINS.length && cards.every((card) => Math.abs(card.offsetWidth - card.offsetHeight) <= 1), "插件市场是一组方形卡片");
    await checkPluginAuthors(cards, market.items, market.authors, check);
    const get = document.querySelector<HTMLButtonElement>(`button[aria-label='${market.installNamed(market.items.dingtalk.name)}']`)!;
    await act(async () => get.click());
    check(JSON.stringify(JSON.parse(localStorage.getItem(NATIVE_PLUGINS_KEY) ?? "[]")) === JSON.stringify(["dingtalk"]) && cards[0].classList.contains("plugin-card--installed"), "安装后写入已安装列表并显示已安装");
    check(JSON.parse(localStorage.getItem(OFFICE_IM_ENABLED_KEY) ?? "{}").dingtalk === true, "安装钉钉同时打开它在消息设置里的开关");
    await act(async () => document.querySelector<HTMLButtonElement>(`button[aria-label='${market.uninstallNamed(market.items.dingtalk.name)}']`)!.click());
    check(localStorage.getItem(NATIVE_PLUGINS_KEY) === "[]" && !cards[0].classList.contains("plugin-card--installed"), "卸载后恢复为未安装");
    await act(async () => document.querySelector<HTMLButtonElement>(`button[aria-label='${market.installNamed(market.items.cursor.name)}']`)!.click());
    check(latestSettings.agentShowCursor, "安装 Cursor 同时打开它在 Agent 设置里的开关");
    await act(async () => document.querySelector<HTMLButtonElement>(`button[aria-label='${market.installNamed(market.items.zcode.name)}']`)!.click());
    check(latestSettings.agentShowZcode && latestSettings.agentQuotaSources.includes("zcode"), "安装 Z Code 同时打开它的开关并勾上额度环");
    await act(async () => document.querySelector<HTMLButtonElement>(`button[aria-label='${market.uninstallNamed(market.items.zcode.name)}']`)!.click());
    await act(async () => document.querySelector<HTMLButtonElement>(`button[aria-label='${market.uninstallNamed(market.items.cursor.name)}']`)!.click());
    const name = market.items.clockWeather.name;
    const weatherInstall = () => document.querySelector<HTMLButtonElement>(`button[aria-label='${market.installNamed(name)}']`)!;
    const weatherRemove = () => document.querySelector<HTMLButtonElement>(`button[aria-label='${market.uninstallNamed(name)}']`)!;
    const weatherSwitch = () => document.querySelector<HTMLInputElement>(`[role=switch][aria-label='${market.enableNamed(name)}']`);
    const weatherSidebar = () => document.querySelector("[data-category='clockWeather']");
    check(!weatherSwitch() && !weatherSidebar(), "未安装的卡片没有开关和独立栏目");
    await act(async () => weatherInstall().click());
    const toggle = weatherSwitch()!;
    const card = toggle.closest<HTMLElement>(".plugin-card")!;
    const shownCards = () => [...document.querySelectorAll<HTMLElement>(".plugin-card")];
    check(shownCards()[0] === card && shownCards().every((item, index, all) => index === 0
      || !item.classList.contains("plugin-card--installed") || all[index - 1].classList.contains("plugin-card--installed")),
      "Installed cards come first in the market");
    const visuals = [card.querySelector(".plugin-card__tile")!, card.querySelector(".plugin-card__check")!];
    check(toggle.checked && weatherSidebar() && !document.querySelector(`input[aria-label='${t.clockWeather.city}']`),
      "安装默认启用，天气设置只出现在独立栏目");
    const weatherSettings = JSON.stringify({ showClock: true, showWeather: false, location: { name: "Shenzhen", latitude: 22.5, longitude: 114.1 } });
    localStorage.setItem(CLOCK_WEATHER_KEY, weatherSettings);
    await act(async () => toggle.click());
    check(!toggle.checked && card.classList.contains("plugin-card--installed") && !weatherSidebar(), "关闭插件隐藏功能入口并保留安装状态");
    check(visuals.every((visual) => getComputedStyle(visual).filter.includes("grayscale(1)") && Number(getComputedStyle(visual).opacity) < 1),
      "关闭后磁贴和对勾变灰");
    await act(async () => toggle.click());
    check(toggle.checked && weatherSidebar() && localStorage.getItem(CLOCK_WEATHER_KEY) === weatherSettings
      && !card.classList.contains("plugin-card--disabled"), "重新打开恢复功能与外观并保留设置");
    await act(async () => {
      localStorage.setItem(DISABLED_NATIVE_PLUGINS_KEY, JSON.stringify(["clockWeather"]));
      window.dispatchEvent(new StorageEvent("storage", { key: DISABLED_NATIVE_PLUGINS_KEY }));
    });
    check(!toggle.checked && !weatherSidebar(), "从其他窗口关闭时，市场与功能入口同步");
    await act(async () => weatherRemove().click());
    check(!weatherSwitch(), "停用的插件仍可卸载");
    await act(async () => weatherInstall().click());
    check(weatherSwitch()?.checked && weatherSidebar(), "卸载再安装默认启用");

    const fixture = document.getElementById("fixture")!;
    fixture.style.width = "168px";
    await wait();
    const fixtureBox = fixture.getBoundingClientRect();
    const switchBox = weatherSwitch()!.getBoundingClientRect();
    const buttonBox = weatherRemove().getBoundingClientRect();
    check(cards.every((item) => item.getBoundingClientRect().right <= fixtureBox.right + 1 && item.scrollWidth <= item.clientWidth)
      && switchBox.right < buttonBox.left && Math.abs(switchBox.top + switchBox.height / 2 - buttonBox.top - buttonBox.height / 2) <= 1
      && buttonBox.right <= card.getBoundingClientRect().right, "最窄卡片的开关与卸载按钮同排且不溢出");
    fixture.style.width = "";
    await act(async () => weatherRemove().click());
    const batteryName = market.items.battery.name;
    const batteryCard = cards.find((item) => item.querySelector(".plugin-card__name")?.textContent === batteryName)!;
    check(batteryCard.querySelector("[data-plugin-icon='battery']") && batteryCard.querySelector(".plugin-author__name")?.textContent === "QXiaoLingShang",
      "电池是市场里的一张卡片，带自己的图标和作者");
    await act(async () => document.querySelector<HTMLButtonElement>(`button[aria-label='${market.installNamed(batteryName)}']`)!.click());
    const batterySwitch = document.querySelector<HTMLInputElement>(`[role=switch][aria-label='${market.enableNamed(batteryName)}']`)!;
    check(batterySwitch.checked && batterySidebar() && !hostCalls.includes("get_notebook_battery"), "装上电池默认启用，设置在独立栏目里");
    await act(async () => batterySwitch.click());
    check(!batterySidebar(), "关闭电池插件隐藏它的栏目");
    await act(async () => document.querySelector<HTMLButtonElement>(`button[aria-label='${market.uninstallNamed(batteryName)}']`)!.click());
  }
  if (!PLUGINS_ENABLED) {
    if (PLUGIN_MARKET_ENABLED) {
      check(MARKET_PACKAGES.length === PACKAGED_MARKET_PLUGINS.length, "三个正式包都已开放安装");
      for (const { id } of PACKAGED_MARKET_PLUGINS) {
        if (MARKET_PACKAGES.some((entry) => entry.id === id)) continue;
        const name = t.market.items[id].name;
        const card = cards.find((item) => item.querySelector("h3")?.textContent === name);
        const preview = card?.querySelector<HTMLButtonElement>("button");
        check(preview?.disabled && preview.textContent?.trim() === t.market.inDevelopment, `${name} 显示不可点击的开发中按钮`);
        await act(async () => { preview?.click(); });
      }
      check(!hostCalls.includes("install_plugin"), "开发中卡片不会触发安装请求");
    }
    if (PLUGIN_MARKET_ENABLED && MARKET_PACKAGES.some(({ id }) => id === "eye-care")) {
      const market = t.market;
      const name = market.items["eye-care"].name;
      const install = () => document.querySelector<HTMLButtonElement>(`[aria-label="${market.installNamed(name)}"]`)!;
      const remove = () => document.querySelector<HTMLButtonElement>(`[aria-label="${market.uninstallNamed(name)}"]`)!;
      const fixture = document.getElementById("fixture")!;
      fixture.style.width = "168px";
      installFailure = "plugin_index_unavailable";
      await act(async () => { install().click(); });
      await wait();
      const alert = install().closest("li")?.querySelector("[role='alert']");
      check(alert?.textContent === market.failure.plugin_index_unavailable + market.retry && alert.scrollWidth <= alert.clientWidth
        && alert.getBoundingClientRect().bottom <= install().getBoundingClientRect().top, "目录未发布时在窄卡片内显示本地化原因并保留重试");
      installFailure = "https://user:secret@example.com/D:/private";
      await act(async () => { install().click(); });
      await wait();
      check(install().closest("li")?.querySelector("[role='alert']")?.textContent === market.operationFailed(name) + market.retry
        && !document.body.textContent?.includes("user:secret"), "未知错误不泄露路径或凭据");
      fixture.style.width = "";
      installFailure = "";
      holdInstall = true;
      const progress = async (phase: PluginInstallProgress["phase"], downloaded: number, total: number) => {
        hostJobs = [{ id: "eye-care", phase, downloaded, total, error: null }];
        await act(async () => { await emit(PLUGIN_PROGRESS_EVENT, hostJobs[0]); });
      };
      await checkInstallProgress({
        t: market, name, check, wait, progress, install,
        installCalls: () => hostCalls.filter((command) => command === "install_plugin").length,
        remount: async () => {
          await act(async () => app.render(<StrictMode><I18nProvider><span /></I18nProvider></StrictMode>));
          await act(async () => app.render(<StrictMode><I18nProvider><Page /></I18nProvider></StrictMode>));
          await wait();
        },
        finish: async () => { await act(async () => finishInstall?.()); await wait(); },
      });
      await act(async () => { remove().click(); });
      await wait();
      await checkInstallCancel({
        t: market, name, check, wait, progress, install,
        cancelCalls: () => hostCalls.filter((command) => command === "cancel_plugin_install").length,
      });
      await act(async () => { install().click(); });
      await act(async () => finishInstall?.()); await wait();
      holdInstall = false;
      check(hostCalls.includes("install_plugin") && !hostCalls.includes("set_plugin_enabled") && registry.installed["eye-care"]?.enabled && Boolean(remove()),
        "市场包由宿主在同一个任务里安装并启用，保留卡片入口");
      await act(async () => { remove().click(); });
      await wait();
      installFailure = "plugin_download_timeout";
      await act(async () => { install().click(); });
      await wait();
      const failedCard = install().closest("li")!;
      const retry = [...failedCard.querySelectorAll("button")].find((item) => item.textContent === market.retry);
      check(failedCard.querySelector("[role='alert']")?.textContent?.startsWith(market.failure.plugin_download_timeout) && retry,
        "下载失败时卡片内显示原因和重试链接");
      installFailure = "";
      await act(async () => { retry!.click(); });
      await wait();
      check(registry.installed["eye-care"]?.enabled && Boolean(remove()), "点重试后装上");
      const gear = () => document.querySelector<HTMLButtonElement>(`[aria-label="${market.openSettingsNamed(name)}"]`);
      check(!document.querySelector(`[aria-label="${manifest.settings[0].label[locale]}"]`)
        && document.querySelector("[data-category='plugin:eye-care']"), "安装后护眼设置进独立栏目，插件页不显示设置行");
      await act(async () => { gear()!.click(); });
      check(openedSettings[openedSettings.length - 1]?.category === "plugin:eye-care", "打开设置指向护眼提醒的栏目");
      fixture.style.width = "168px";
      const installedCard = gear()!.closest<HTMLElement>(".plugin-card")!;
      check(installedCard.scrollWidth <= installedCard.clientWidth
        && gear()!.getBoundingClientRect().right < remove().getBoundingClientRect().left, "最窄卡片的开关、打开设置和卸载按钮不重叠");
      fixture.style.width = "";
      const noRequestYet = requests.length === 0;
      const updates = () => document.querySelector<HTMLElement>(".plugin-market__updates")!;
      await act(async () => { updates().querySelector("button")!.click(); });
      await act(async () => requests[requests.length - 1].resolve([{ id: "eye-care", version: "9.0.0" } as PluginIndexEntry])); await wait();
      check(noRequestYet && requests.length === 1 && document.querySelector(".plugin-card__update")?.textContent?.includes(market.updateAvailable("9.0.0")),
        "只有点检查更新才请求索引，有新版本时卡片提示更新");
      await act(async () => { remove().click(); });
      await wait();
      check(!registry.installed["eye-care"] && Boolean(install()) && !gear() && !document.querySelector("[data-category='plugin:eye-care']"),
        "市场卸载与宿主安装状态同步，设置入口一起消失");
    }
    const guide = document.querySelector<HTMLElement>(".plugin-development")!;
    check(guide?.textContent?.includes(t.guide) && guide.textContent.includes(t.guideHint) && !guide.querySelector("h2, h3, .settings-group__title"), "市场下方只保留本地化的开发规范入口，没有开发计划标题");
    check(!document.querySelector(PLUGIN_MARKET_ENABLED ? ".plugins-settings, details" : ".plugins-settings, details, input, select")
      && hostCalls.filter((command) => command === "get_plugins_index").length === 1 && !hostCalls.includes("configure_plugins"),
      "正式市场不会自行请求索引或开放开发者配置");
    const link = button(t.readGuide);
    await act(async () => { failOpen = true; link.click(); });
    check(guide.querySelector("[role='alert']")?.textContent === t.openGuideFailed, "外链失败在原地提供本地化提示");
    await act(async () => { failOpen = false; link.click(); });
    check(opened === "https://github.com/flyl1u/fly-island/blob/main/docs/plugins/README.md" && !guide.querySelector("[role='alert']"), "重试用 opener 打开规范总览并清除错误");
    const fixture = document.getElementById("fixture")!;
    check(guide.scrollWidth <= fixture.clientWidth && link.getBoundingClientRect().right <= fixture.getBoundingClientRect().right + 1,
      "中英文规范入口在窄布局中不溢出");
  } else {
    check(requests.length >= 1, "索引请求已开始");
    await act(async () => resolveRegistry?.()); await wait();
    const developer = document.querySelector<HTMLDetailsElement>("details")!;
    check(!developer.open, "开发者分组默认折叠");
    await act(async () => developer.querySelector("summary")!.click());
    const input = document.querySelector<HTMLInputElement>(`input[aria-label='${t.index}']`)!;
    check(input.value === stored, "异步恢复后显示已保存的 Windows 索引路径");
    check(!button(t.save).disabled, "网络请求未完成时仍可设置本地索引");
    await act(async () => requests[requests.length - 1].reject("HTTP 404 https://github.com/releases/missing")); await wait();
    check(document.body.textContent?.includes(t.market.failure.plugin_index_unavailable) && !document.body.textContent?.includes("HTTP 404"), "索引失败只显示翻译后的简短状态");
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
    const next = "D:\\Fly Island\\artifacts\\plugins\\plugins-index.json";
    await act(async () => { setter.call(input, next); input.dispatchEvent(new Event("input", { bubbles: true })); });
    const beforeSave = requests.length;
    await act(async () => button(t.save).click()); await wait();
    check(registry.indexUrl === next && requests.length > beforeSave, "保存路径会自动读取新索引");
    const newest = requests[requests.length - 1];
    await act(async () => newest.resolve([])); await wait();
    await act(async () => requests[0].reject("old request failed")); await wait();
    check(!document.body.textContent?.includes(t.market.failure.plugin_index_unavailable), "已失效的旧请求不能覆盖新索引结果");
    await act(async () => document.querySelector<HTMLButtonElement>(`button[aria-label='${t.develop}']`)!.click());
    check(opened === "https://github.com/flyl1u/fly-island/blob/main/docs/plugins/README.md", "开发指引使用既有外链 opener");
    check(input.getBoundingClientRect().right <= document.getElementById("fixture")!.getBoundingClientRect().right + 1, "中英文窄布局的路径输入框不溢出");
    const field = (key: string) => document.querySelector<HTMLInputElement>(`input[aria-label='${manifest.settings.find((s) => s.key === key)!.label[locale]}']`)!;
    check(field("idle").getAttribute("aria-label") === (locale === "en" ? "Idle duration (1–120 minutes)" : "空闲时长（1–120 分钟）"), "空闲时长使用当前语言的标签");
    check(field("idle").closest(".settings-row")?.querySelector(".settings-row__description")?.textContent
      === manifest.settings.find((s) => s.key === "idle")!.description?.[locale], "空闲时长显示清单里当前语言的暂停、重置与恢复说明");
    const settingRow = (key: string) => [...document.querySelectorAll<HTMLElement>(".settings-row")]
      .find((item) => item.querySelector(".settings-row__title")?.textContent === manifest.settings.find((s) => s.key === key)!.label[locale]);
    const fullscreenSwitch = () => settingRow("pause-fullscreen")?.querySelector<HTMLInputElement>("input[role='switch']")!;
    check(fullscreenSwitch().checked && !settingRow("pause-fullscreen")?.querySelector(".settings-row__description"),
      "全屏暂停开关默认开启，只有一行文案");
    await act(async () => fullscreenSwitch().click());
    await wait();
    check(eyeCare.settings["pause-fullscreen"] === "false", "关闭全屏暂停立即保存");
    await act(async () => fullscreenSwitch().click());
    await wait();
    const edit = async (input: HTMLInputElement, value: string) => act(async () => {
      setter.call(input, value); input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    const pause = (ms: number) => act(async () => { await new Promise((resolve) => setTimeout(resolve, ms)); });
    for (const [key, value] of [["period", "25"], ["rest-minutes", "2"], ["idle", "8"]]) {
      const number = field(key);
      check(number.inputMode === "numeric" && !number.closest(".settings-row")?.querySelector("button"), `${key} 使用整数输入且不显示保存按钮`);
      await act(async () => number.focus());
      const count = saves.length;
      await edit(number, value.slice(0, 1)); await edit(number, value);
      await pause(600); await wait();
      check(eyeCare.settings[key] === value && saves.length === count + 1, `${key} 连续输入自动合并为一次保存`);
      check(field(key) === number && document.activeElement === number && !number.disabled, `${key} 保存后保留输入焦点`);
    }
    const period = field("period");
    await act(async () => period.focus());
    const count = saves.length;
    for (const invalid of ["", "0", "721", "1.5"]) { await edit(period, invalid); await pause(550); }
    check(saves.length === count && eyeCare.settings.period === "25", "空值、越界值和小数不会覆盖有效设置");
    await edit(period, "30");
    await act(async () => period.blur()); await wait();
    check(eyeCare.settings.period === "30", "离开输入框立即保存最后的有效值");
    saveDelay = 300;
    await act(async () => period.focus());
    await edit(period, "31"); await pause(550);
    await edit(period, "32"); await pause(900); await wait();
    check(eyeCare.settings.period === "32" && field("period").value === "32" && document.activeElement === period,
      "保存进行中继续输入不会丢字或被旧值覆盖");
    saveDelay = 0;
    await edit(field("idle"), "9");
  }
  await act(async () => app.unmount());
  await wait();
  if (PLUGINS_ENABLED) check(eyeCare.settings.idle === "9", "离开设置页仍会保存尚未到期的有效输入");
  document.getElementById("results")!.textContent = [...messages, "ALL PASS"].join("\n");
  document.documentElement.dataset.testResult = "passed";
} catch (error) {
  document.getElementById("results")!.textContent = [...messages, `FAIL ${String(error)}`].join("\n");
  document.documentElement.dataset.testResult = "failed";
}
