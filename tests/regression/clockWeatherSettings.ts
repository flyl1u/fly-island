import { act } from "react";
import { TRANSLATIONS } from "../../src/i18n";
import { CLOCK_WEATHER_KEY } from "../../src/features/weather/storage";

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
  const saved = () => JSON.parse(localStorage.getItem(CLOCK_WEATHER_KEY) ?? "{}");
  const toggle = (title: string) => [...document.querySelectorAll<HTMLElement>(".settings-row")]
    .find((row) => row.querySelector(".settings-row__title")?.textContent === title)!
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

  await openPage("clockWeather");
  const input = document.querySelector<HTMLInputElement>(`input[aria-label='${t.city}']`);
  check(Boolean(input) && !document.querySelector(".clock-weather-settings__cities"), "The installed Clock & Weather plugin has its own settings page");
  await act(async () => toggle(t.showClock).click());
  check(saved().showClock === false && saved().showWeather === true, "Time and weather switches save independently");
  await act(async () => toggle(t.showClock).click());
  await search("Beijing");
  const result = document.querySelector<HTMLButtonElement>(".clock-weather-settings__cities button");
  check(Boolean(result?.textContent), "The standalone page searches and lists cities");
  await act(async () => result!.click());
  check(saved().location?.latitude === 39.9 && saved().location?.longitude === 116.4
    && !document.querySelector(".clock-weather-settings__cities"), "Selecting a city saves its coordinates");
  await act(async () => document.querySelector<HTMLButtonElement>(`button[aria-label='${t.locate}']`)!.click());
  check(saved().location?.name?.length > 0, "Clicking Locate saves the returned location");
  const row = input!.closest(".settings-row")!;
  check(row.scrollWidth <= row.clientWidth, "The location controls fit a narrow row");

  await openPage("plugins");
  await click(`button[aria-label='${market.uninstallNamed(name)}']`);
  check(!document.querySelector(".settings-sidebar__item[data-category='clockWeather']")
    && document.querySelector(".settings-page__title")?.textContent === categories.plugins,
  "Uninstalling Clock & Weather removes its sidebar page and returns to Plugins");
  await click(`button[aria-label='${market.installNamed(name)}']`);
  check(Boolean(document.querySelector(".settings-sidebar__item[data-category='clockWeather']"))
    && saved().location?.name?.length > 0, "Reinstalling restores the page and keeps the city");
}
