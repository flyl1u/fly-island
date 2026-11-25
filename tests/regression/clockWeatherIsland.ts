import { act } from "react";
import { setNativePluginInstalled, NATIVE_PLUGINS_KEY } from "../../src/features/plugins/native";
import { setClockWeatherSettings } from "../../src/features/weather";
import { CLOCK_WEATHER_KEY, WEATHER_CACHE_KEY } from "../../src/features/weather/storage";
import { WEATHER_MAX_AGE_MS } from "../../src/features/weather/model";

export const clockWeatherMock = {
  offline: false, requests: 0,
  current() {
    this.requests++;
    if (this.offline) throw new Error("offline");
    return { temperature: 23, code: 2, observedAt: Date.now(), fetchedAt: Date.now() };
  },
};

export async function checkClockWeatherIsland(
  check: (condition: unknown, message: string) => void,
  settle: (ms: number) => Promise<void>,
) {
  const city = { name: "Beijing · China", latitude: 39.9, longitude: 116.4 };
  const clock = () => document.querySelector<HTMLElement>(".island__collapsed .collapsed-clock");
  const weather = () => document.querySelector<HTMLElement>(".island__collapsed .collapsed-weather");
  const island = () => document.querySelector<HTMLElement>(".island")!;
  await act(async () => {
    setNativePluginInstalled("clockWeather", false);
    localStorage.removeItem(CLOCK_WEATHER_KEY);
    window.dispatchEvent(new StorageEvent("storage", { key: CLOCK_WEATHER_KEY }));
  });
  await settle(800);
  const baseWidth = island().getBoundingClientRect().width;
  check(!clock() && !weather(), "未安装时间天气插件时两个位完全隐藏");
  await act(async () => setNativePluginInstalled("clockWeather", true));
  await settle(450);
  check(/^\d{2}:\d{2}$/.test(clock()?.textContent ?? "") && !weather() && clockWeatherMock.requests === 0,
    "安装后显示24小时时间，未选城市不显示天气且不发请求");
  await act(async () => setClockWeatherSettings({ showClock: true, showWeather: true, location: city }));
  await settle(450);
  if (new URLSearchParams(location.search).has("notch")) {
    // A manual width is the whole island (B3-1): 240 at a 120% font leaves no room for the weather,
    // so it hides (the time stays) and the island does not grow. The wide pages cover the rest.
    check(clock() && !weather() && clockWeatherMock.requests === 1 && Math.abs(island().getBoundingClientRect().width - baseWidth) < 1,
      `手动窄宽度下天气先隐藏、岛屿不变长，仍只发一次请求（${baseWidth} → ${island().getBoundingClientRect().width}）`);
    const narrowBar = document.querySelector<HTMLElement>(".island__collapsed")!;
    const narrowBox = island().getBoundingClientRect();
    check([...narrowBar.children].every(child => {
      const rect = child.getBoundingClientRect();
      return rect.left >= narrowBox.left + 8 && rect.right <= narrowBox.right - 8;
    }) && narrowBar.querySelector(".island__text-slot")!.getBoundingClientRect().width >= 64,
    "窄岛与放大字体下所有状态位在岛内，文字保留可读空间");
    return;
  }
  check(weather()?.textContent === "23°" && weather()?.querySelector("svg") && clockWeatherMock.requests === 1,
    "选城市后显示图标温度，同窗口多个订阅与StrictMode共享一次请求");
  const bar = document.querySelector<HTMLElement>(".island__collapsed")!;
  const box = island().getBoundingClientRect();
  check([...bar.children].every(child => {
    const rect = child.getBoundingClientRect();
    return rect.left >= box.left + 8 && rect.right <= box.right - 8;
  }) && bar.querySelector(".island__text-slot")!.getBoundingClientRect().width >= 64,
    "窄岛与放大字体下所有状态位在岛内，文字保留可读空间");
  const fixedClockWidth = clock()!.getBoundingClientRect().width;
  await act(async () => window.dispatchEvent(new Event("focus")));
  check(clock()!.getBoundingClientRect().width === fixedClockWidth, "时间对齐刷新不会改变固定数字宽度");
  await act(async () => setClockWeatherSettings({ showClock: false }));
  check(!clock() && weather(), "关闭时间不影响天气");
  await act(async () => {
    localStorage.setItem(CLOCK_WEATHER_KEY, JSON.stringify({ showClock: true, showWeather: false, location: city }));
    window.dispatchEvent(new StorageEvent("storage", { key: CLOCK_WEATHER_KEY }));
  });
  check(clock() && !weather(), "另一窗口的独立开关通过storage事件同步到岛");
  const clockOnlyWidth = parseFloat(getComputedStyle(island()).getPropertyValue("--collapsed-island-width"));
  await act(async () => {
    localStorage.setItem(NATIVE_PLUGINS_KEY, JSON.stringify(JSON.parse(localStorage.getItem(NATIVE_PLUGINS_KEY) ?? "[]")
      .filter((id: string) => id !== "clockWeather")));
    window.dispatchEvent(new StorageEvent("storage", { key: NATIVE_PLUGINS_KEY }));
  });
  await settle(450);
  check(!clock() && !weather() && (new URLSearchParams(location.search).has("notch")
    ? Math.abs(island().getBoundingClientRect().width - baseWidth) < 1 : island().getBoundingClientRect().width < clockOnlyWidth),
    `另一窗口卸载后两个位消失，收起岛恢复原宽度（${baseWidth} → ${island().getBoundingClientRect().width}）`);

  // A near-expiry cached observation plus a failed fetch exercises real expiry timers.
  const oldCity = { name: "Cached city", latitude: 40.1, longitude: 116.1 };
  clockWeatherMock.offline = true;
  localStorage.setItem(WEATHER_CACHE_KEY, JSON.stringify({ ...oldCity, temperature: -2.5, code: 71,
    observedAt: Date.now() - WEATHER_MAX_AGE_MS + 900, fetchedAt: Date.now() - WEATHER_MAX_AGE_MS + 900 }));
  await act(async () => {
    setNativePluginInstalled("clockWeather", true);
    setClockWeatherSettings({ showClock: true, showWeather: true, location: oldCity });
  });
  await settle(100);
  check(weather()?.textContent === "-2°" && !document.querySelector("[role=alert]"),
    "离线失败保留尚有效的天气缓存且不弹错误");
  await settle(1000);
  check(!weather(), "观测超过3小时后自动隐藏，不等下一轮刷新");
  clockWeatherMock.offline = false;
  await act(async () => setClockWeatherSettings({ showClock: true, showWeather: true, location: city }));
  await settle(450);
  check(weather()?.textContent === "23°" && !weather()?.textContent?.includes("-2"),
    "切回城市读取匹配缓存，不混用其它位置的天气");
}
