import { act } from "react";
import { TRANSLATIONS } from "../../src/i18n";
import { CLOCK_WEATHER_KEY, loadClockWeatherSettings } from "../../src/features/weather/storage";
import { DISABLED_NATIVE_PLUGINS_KEY, NATIVE_PLUGINS_KEY, setNativePluginInstalled } from "../../src/features/plugins/native";

export function prepareClockWeatherSettings(installed: boolean, automated: boolean) {
  localStorage.removeItem(DISABLED_NATIVE_PLUGINS_KEY);
  if (!installed) {
    localStorage.removeItem(NATIVE_PLUGINS_KEY);
    return;
  }
  localStorage.setItem(NATIVE_PLUGINS_KEY, JSON.stringify(["clockWeather"]));
  if (automated) {
    localStorage.removeItem(CLOCK_WEATHER_KEY);
  } else {
    localStorage.setItem(CLOCK_WEATHER_KEY, JSON.stringify({
      showClock: true, showWeather: true, location: { name: "北京 · 中国", latitude: 39.9, longitude: 116.4 },
    }));
  }
}

export async function checkClockWeatherSettingsPage(
  locale: "zh-CN" | "en",
  openPage: (category: string) => Promise<void>,
  click: (selector: string) => Promise<void>,
  check: (value: unknown, label: string) => void,
) {
  const categories = TRANSLATIONS[locale].settings.categories;
  const t = TRANSLATIONS[locale].settings.plugins.clockWeather;
  const market = TRANSLATIONS[locale].settings.plugins.market;
  const name = market.items.clockWeather.name;
  const cityInput = () => document.querySelector<HTMLInputElement>(`input[aria-label='${t.city}']`)!;
  const currentCity = () => document.querySelector(".clock-weather-settings__current")?.textContent;
  const saved = loadClockWeatherSettings;
  const toggle = (title: string) => [...document.querySelectorAll<HTMLElement>(".settings-row")]
    .find((row) => row.querySelector(".settings-row__title")?.textContent === title)!
    .querySelector<HTMLInputElement>("[role=switch]")!;
  const type = async (value: string) => act(async () => {
    const input = cityInput();
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  const search = async (value: string) => {
    await type(value);
    await act(async () => cityInput().dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })));
  };

  await openPage("clockWeather");
  check(Boolean(cityInput()) && currentCity() === t.noCity && cityInput().placeholder === t.cityPlaceholder,
    "The standalone settings page says when no city is selected");
  await act(async () => toggle(t.showClock).click());
  check(saved().showClock === false && saved().showWeather === true, "Time and weather switches save independently");
  await act(async () => toggle(t.showClock).click());
  await search("Beijing");
  const result = document.querySelector<HTMLButtonElement>(".clock-weather-settings__cities button");
  check(Boolean(result?.textContent) && saved().location === null, "Searching lists cities without changing the saved selection");
  const selected = result!.textContent!;
  await act(async () => result!.click());
  check(saved().location?.latitude === 39.9 && saved().location?.longitude === 116.4
    && currentCity() === t.currentCity(selected) && !document.querySelector(".clock-weather-settings__cities"),
    "Selecting a city saves its coordinates and labels it as the current city");
  const originalInput = cityInput();

  await openPage("general");
  await openPage("clockWeather");
  check(cityInput() !== originalInput && cityInput().value === "" && cityInput().placeholder === t.otherCityPlaceholder
    && currentCity() === t.currentCity(selected) && saved().location?.name === selected,
    "Remounting keeps the selected city and leaves the search for choosing another");
  const row = cityInput().closest(".settings-row")!;
  check(row.scrollWidth <= row.clientWidth, "The location controls fit a narrow row");

  const selectedRecord = localStorage.getItem(CLOCK_WEATHER_KEY);
  await act(async () => setNativePluginInstalled("clockWeather", false));
  check(!document.querySelector(".settings-sidebar__item[data-category='clockWeather']")
    && document.querySelector(".settings-page__title")?.textContent === categories.plugins
    && localStorage.getItem(CLOCK_WEATHER_KEY) === selectedRecord,
    "Uninstalling from another view falls back to Plugins and keeps the saved settings");
  await click(`button[aria-label='${market.installNamed(name)}']`);
  await openPage("clockWeather");
  check(currentCity() === t.currentCity(selected) && saved().location?.name === selected,
    "Reinstalling restores the selected city on the weather page");

  await act(async () => document.querySelector<HTMLButtonElement>(`button[aria-label='${t.locate}']`)!.click());
  const located = "深圳市 · 广东省";
  check(saved().location?.name === located && currentCity() === t.currentCity(located),
    "Clicking Locate explicitly replaces the saved city");
}
