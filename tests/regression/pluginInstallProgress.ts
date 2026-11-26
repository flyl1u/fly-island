// The market card while an install runs; part of plugins-settings.tsx, which owns the mock host.
import { act } from "react";
import type { PluginInstallProgress } from "../../src/features/plugins/api";
import type { SettingsPluginMarketText } from "../../src/i18n/sections/settings/plugins";

export async function checkInstallProgress({ t, name, check, wait, progress, install, installCalls, remount, finish }: {
  t: SettingsPluginMarketText;
  name: string;
  check: (condition: unknown, label: string) => void;
  wait: () => Promise<void>;
  /** The host reports a stage, by event and in its job list. */
  progress: (phase: PluginInstallProgress["phase"], downloaded: number, total: number) => Promise<void>;
  install: () => HTMLButtonElement;
  installCalls: () => number;
  /** Leaves the Plugins page and comes back. */
  remount: () => Promise<void>;
  finish: () => Promise<void>;
}) {
  const card = () => [...document.querySelectorAll<HTMLElement>(".plugin-card")]
    .find((item) => item.querySelector("h3")?.textContent === name)!;
  const busy = () => card().querySelector<HTMLButtonElement>("button[aria-busy='true']");
  const bar = () => card().querySelector<HTMLElement>("[role='progressbar']");
  const before = installCalls();
  await act(async () => { install().click(); });
  check(busy()?.disabled && busy()?.textContent === t.installing && bar() && card().textContent?.includes(t.connecting),
    "点安装后立刻进入安装中状态");
  await act(async () => { busy()?.click(); });
  check(installCalls() === before + 1, "安装中重复点击不会再次请求安装");

  await progress("downloading", 3355443, 13421772);
  check(card().textContent?.includes(t.downloaded("3.2", "12.8")) && card().textContent?.includes("25%")
    && bar()?.getAttribute("aria-valuenow") === "25", "下载阶段显示已下载大小、总大小和百分比");
  check(card().scrollWidth <= card().clientWidth && Math.abs(card().offsetWidth - card().offsetHeight) <= 1,
    "最窄卡片显示进度时不溢出，仍是方形");

  await remount();
  check(busy()?.textContent === t.installing && card().textContent?.includes("25%"), "切走再回到插件页，安装进度仍在");

  await progress("verifying", 13421772, 13421772);
  check(card().textContent?.includes(t.verifying), "校验阶段显示校验文案");
  await progress("installing", 13421772, 13421772);
  check(card().textContent?.includes(t.unpacking), "安装阶段显示安装文案");
  await finish();
  await wait();
  check(!busy() && !bar() && card().classList.contains("plugin-card--installed"), "完成后卡片变为已安装");
}
