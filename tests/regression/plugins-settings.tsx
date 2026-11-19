import { act, StrictMode, useState } from "react";
import { createRoot } from "react-dom/client";
import { mockIPC } from "@tauri-apps/api/mocks";
import { PluginsSettingsPage } from "../../src/windows/settings/PluginsSettingsPage";
import { I18nProvider, LOCALE_STORAGE_KEY, TRANSLATIONS } from "../../src/i18n";
import type { PluginIndexEntry } from "../../src/features/plugins/api";
import { PLUGINS_ENABLED } from "../../src/features/releaseFlags.ts";
import { NATIVE_PLUGINS, NATIVE_PLUGINS_KEY } from "../../src/features/plugins/native";
import { DEFAULT_SETTINGS } from "../../src/features/appearance/settings";
import type { IslandSettings } from "../../src/features/appearance/types";
import { OFFICE_IM_ENABLED_KEY } from "../../src/features/messages/office-im/storage";
import "../../src/styles/tokens.css";
import "../../src/styles/base.css";
import "../../src/windows/settings/LayoutEditor.css";

Object.assign(globalThis, { isTauri: true, IS_REACT_ACT_ENVIRONMENT: true });
const locale = new URLSearchParams(location.search).get("lang") === "en" ? "en" : "zh-CN";
localStorage.setItem(LOCALE_STORAGE_KEY, locale);
const t = TRANSLATIONS[locale].settings.plugins;
const stored = "D:\\CodexBuild\\plugins\\plugins-index.json";
const registry = { installed: {}, developerMode: true, indexUrl: stored };
const snapshot = () => ({ registry: { ...registry }, live: {} });
const requests: { resolve: (items: PluginIndexEntry[]) => void; reject: (reason: string) => void }[] = [];
let resolveRegistry: (() => void) | undefined;
let opened = "";
let failOpen = false;
const hostCalls: string[] = [];
mockIPC((command, payload) => {
  hostCalls.push(command);
  const args = (payload ?? {}) as Record<string, unknown>;
  if (command === "get_plugins") return resolveRegistry
    ? snapshot()
    : new Promise((resolve) => { resolveRegistry = () => resolve(snapshot()); });
  if (command === "get_plugins_index") return new Promise<PluginIndexEntry[]>((resolve, reject) => requests.push({ resolve, reject }));
  if (command === "configure_plugins") { registry.developerMode = Boolean(args.developerMode); registry.indexUrl = String(args.indexUrl); return null; }
  if (command === "plugin:opener|open_url") {
    if (failOpen) throw new Error("open failed");
    opened = String(args.url); return null;
  }
  return null;
}, { shouldMockEvents: true });
const messages: string[] = [];
let latestSettings: IslandSettings = { ...DEFAULT_SETTINGS, agentShowCursor: false };
function Page() {
  const [settings, setSettings] = useState(latestSettings);
  return <PluginsSettingsPage settings={settings} onSettingsChange={(next) => { latestSettings = next; setSettings(next); }} />;
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
  localStorage.setItem(OFFICE_IM_ENABLED_KEY, JSON.stringify({ dingtalk: false, feishu: true, wecom: true }));
  await act(async () => app.render(<StrictMode><I18nProvider><Page /></I18nProvider></StrictMode>)); await wait();
  const market = TRANSLATIONS[locale].settings.plugins.market;
  const cards = [...document.querySelectorAll<HTMLElement>(".plugin-card")];
  check(cards.length === NATIVE_PLUGINS.length && cards.every((card) => Math.abs(card.offsetWidth - card.offsetHeight) <= 1), "插件市场是一组方形卡片");
  const get = document.querySelector<HTMLButtonElement>(`button[aria-label='${market.installNamed(market.items.dingtalk.name)}']`)!;
  await act(async () => get.click());
  check(JSON.stringify(JSON.parse(localStorage.getItem(NATIVE_PLUGINS_KEY) ?? "[]")) === JSON.stringify(["dingtalk"]) && cards[0].classList.contains("plugin-card--installed"), "安装后写入已安装列表并显示已安装");
  check(JSON.parse(localStorage.getItem(OFFICE_IM_ENABLED_KEY) ?? "{}").dingtalk === true, "安装钉钉同时打开它在消息设置里的开关");
  await act(async () => document.querySelector<HTMLButtonElement>(`button[aria-label='${market.uninstallNamed(market.items.dingtalk.name)}']`)!.click());
  check(localStorage.getItem(NATIVE_PLUGINS_KEY) === "[]" && !cards[0].classList.contains("plugin-card--installed"), "卸载后恢复为未安装");
  await act(async () => document.querySelector<HTMLButtonElement>(`button[aria-label='${market.installNamed(market.items.cursor.name)}']`)!.click());
  check(latestSettings.agentShowCursor, "安装 Cursor 同时打开它在 Agent 设置里的开关");
  await act(async () => document.querySelector<HTMLButtonElement>(`button[aria-label='${market.uninstallNamed(market.items.cursor.name)}']`)!.click());
  const fixtureBox = document.getElementById("fixture")!.getBoundingClientRect();
  check(cards.every((card) => card.getBoundingClientRect().right <= fixtureBox.right + 1 && card.scrollWidth <= card.clientWidth), "窄布局下卡片不溢出");
  if (!PLUGINS_ENABLED) {
    const guide = document.querySelector<HTMLElement>(".plugin-development")!;
    check(guide?.textContent?.includes(t.comingSoon) && guide.textContent.includes(t.invitation), "关闭时显示本地化的插件计划与贡献说明");
    check(!document.querySelector(".plugins-settings, details, input, select") && hostCalls.length === 0,
      "关闭时没有安装、启用或开发者功能，也不请求宿主、事件或索引");
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
    check(document.body.textContent?.includes(t.unavailable) && !document.body.textContent?.includes("HTTP 404"), "索引失败只显示翻译后的简短状态");
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
    const next = "D:\\FocuSD\\artifacts\\plugins\\plugins-index.json";
    await act(async () => { setter.call(input, next); input.dispatchEvent(new Event("input", { bubbles: true })); });
    const beforeSave = requests.length;
    await act(async () => button(t.save).click()); await wait();
    check(registry.indexUrl === next && requests.length > beforeSave, "保存路径会自动读取新索引");
    const newest = requests[requests.length - 1];
    await act(async () => newest.resolve([])); await wait();
    await act(async () => requests[0].reject("old request failed")); await wait();
    check(!document.body.textContent?.includes(t.unavailable), "已失效的旧请求不能覆盖新索引结果");
    await act(async () => document.querySelector<HTMLButtonElement>(`button[aria-label='${t.develop}']`)!.click());
    check(opened === "https://github.com/flyl1u/fly-island/blob/main/docs/plugins/README.md", "开发指引使用既有外链 opener");
    check(input.getBoundingClientRect().right <= document.getElementById("fixture")!.getBoundingClientRect().right + 1, "中英文窄布局的路径输入框不溢出");
  }
  await act(async () => app.unmount());
  document.getElementById("results")!.textContent = [...messages, "ALL PASS"].join("\n");
  document.documentElement.dataset.testResult = "passed";
} catch (error) {
  document.getElementById("results")!.textContent = [...messages, `FAIL ${String(error)}`].join("\n");
  document.documentElement.dataset.testResult = "failed";
}
