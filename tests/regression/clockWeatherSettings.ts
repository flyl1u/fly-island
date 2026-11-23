import { act } from "react";
import { TRANSLATIONS } from "../../src/i18n";
import { CLOCK_WEATHER_KEY } from "../../src/features/weather/storage";

export async function checkClockWeatherSettings(locale: "zh-CN" | "en", check: (value: unknown, label: string) => void) {
  const market = TRANSLATIONS[locale].settings.plugins.market;
  const t = TRANSLATIONS[locale].settings.plugins.clockWeather;
  const name = market.items.clockWeather.name;
  const action = (installed: boolean) => document.querySelector<HTMLButtonElement>(
    `button[aria-label='${installed ? market.uninstallNamed(name) : market.installNamed(name)}']`)!;
  const saved = () => JSON.parse(localStorage.getItem(CLOCK_WEATHER_KEY) ?? "{}");
  const toggle = (title: string) => [...document.querySelectorAll<HTMLElement>(".settings-row")]
    .find(row => row.querySelector(".settings-row__title")?.textContent === title)!
    .querySelector<HTMLInputElement>("[role=switch]")!;
  const type = async (value: string) => act(async () => {
    const input = document.querySelector<HTMLInputElement>(`input[aria-label='${t.city}']`)!;
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  const search = async (value: string) => {
    await type(value);
    await act(async () => document.querySelector<HTMLInputElement>(`input[aria-label='${t.city}']`)!
      .dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })));
  };
  localStorage.removeItem(CLOCK_WEATHER_KEY);
  await act(async () => action(false).click());
  check(saved().showClock && saved().showWeather && document.body.textContent?.includes(t.chooseCity),
    "时间天气安装后两个开关默认开，未选城市显示提示");
  await act(async () => toggle(t.showClock).click());
  check(!saved().showClock && saved().showWeather, "时间开关独立保存，不改变天气开关");
  await act(async () => toggle(t.showWeather).click());
  check(!saved().showClock && !saved().showWeather, "天气开关独立保存，不改变时间开关");
  await search("Beijing");
  const result = document.querySelector<HTMLButtonElement>(".clock-weather-settings__cities button")!;
  check(result?.textContent?.includes("Beijing"), "城市搜索展示可选择的结果");
  await act(async () => result.click());
  check(saved().location?.latitude === 39.9 && saved().location?.longitude === 116.4
    && !document.querySelector(".clock-weather-settings__cities"), "选中城市保存名称与坐标并收起结果");
  await search("empty");
  check(document.querySelector("[role=status]")?.textContent === t.noCities, "城市空结果显示本地化反馈");
  await search("offline");
  check(document.querySelector("[role=status]")?.textContent === t.searchFailed, "城市搜索失败可以原地重试");
  await act(async () => action(true).click());
  check(!document.querySelector(`input[aria-label='${t.city}']`), "卸载后移除时间天气设置");
  await act(async () => action(false).click());
  check(saved().showClock && saved().showWeather && saved().location?.name,
    "重新安装默认打开两个开关并保留城市");
  const row = document.querySelector<HTMLInputElement>(`input[aria-label='${t.city}']`)!.closest(".settings-row")!;
  check(row.scrollWidth <= row.clientWidth, "中英文城市设置在窄窗口中不溢出");
  await act(async () => action(true).click());
}
