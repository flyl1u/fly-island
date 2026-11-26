import test from "node:test";
import assert from "node:assert/strict";
import { normalizeClockWeatherSettings, normalizeWeatherCache, normalizeWeatherLocation, weatherForLocation, weatherCondition,
  WEATHER_MAX_AGE_MS, fitClockWeather, formatClock, nextMinuteDelay, formatTemperature } from "../../src/features/weather/model.ts";
import { normalizeCollapsedHidden, placeCollapsedLayout, visibleCollapsedSlots } from "../../src/features/appearance/collapsedLayout.ts";
import { normalizeBehaviorSettings } from "../../src/features/appearance/normalizeBehaviorSettings.ts";
import { CLOCK_WEATHER_KEY, loadClockWeatherSettings, saveClockWeatherSettings } from "../../src/features/weather/storage.ts";

const location = { name: "Beijing", latitude: 39.9, longitude: 116.4 };
const now = 1795089700000;
const cache = { ...location, temperature: 23.2, code: 2, observedAt: now - 100000, fetchedAt: now };

test("clock and weather default on; malformed preferences and coordinates are tolerated", () => {
  for (const value of [null, [], "bad", undefined]) {
    assert.deepEqual(normalizeClockWeatherSettings(value), { showClock: true, showWeather: true, location: null });
  }
  assert.deepEqual(normalizeClockWeatherSettings({ showClock: false, location }), { showClock: false, showWeather: true, location });
  for (const value of [{ ...location, latitude: NaN }, { ...location, longitude: 181 }, { ...location, latitude: "39" }, {}]) {
    assert.equal(normalizeWeatherLocation(value), null);
  }
});
test("only a matching city and observations no older than three hours may be displayed", () => {
  const normalized = normalizeWeatherCache(cache);
  assert.equal(weatherForLocation(normalized, location, now), normalized);
  assert.equal(weatherForLocation(normalized, { ...location, latitude: 40 }, now), null);
  assert.equal(weatherForLocation(normalized, null, now), null);
  assert.equal(weatherForLocation(normalized, location, cache.observedAt + WEATHER_MAX_AGE_MS), normalized);
  assert.equal(weatherForLocation(normalized, location, cache.observedAt + WEATHER_MAX_AGE_MS + 1), null);
  assert.equal(weatherForLocation(normalized, location, now - WEATHER_MAX_AGE_MS), null);
  for (const patch of [{ temperature: NaN }, { temperature: 999 }, { code: 2.5 }, { observedAt: -1 }, { fetchedAt: Infinity }]) {
    assert.equal(normalizeWeatherCache({ ...cache, ...patch }), null);
  }
});
test("WMO weather families map to icon/copy keys and unknown codes safely fall back", () => {
  const groups = { clear: [0], partlyCloudy: [1, 2], cloudy: [3], fog: [45, 48], drizzle: [51, 53, 55],
    freezingRain: [56, 57, 66, 67], rain: [61, 63, 65], snow: [71, 73, 75, 77],
    showers: [80, 81, 82], snowShowers: [85, 86], thunderstorm: [95, 96, 99], unknown: [-1, 4, 100, NaN] };
  for (const [condition, codes] of Object.entries(groups)) for (const code of codes) assert.equal(weatherCondition(code), condition);
});
test("the local clock uses padded 24-hour time and realigns to every whole minute", () => {
  assert.equal(formatClock(new Date(2026, 10, 19, 0, 5)), "00:05");
  assert.equal(formatClock(new Date(2026, 10, 19, 23, 59)), "23:59");
  assert.equal(nextMinuteDelay(60000), 60000);
  assert.equal(nextMinuteDelay(119999), 1);
  assert.equal(nextMinuteDelay(60001), 59999);
  assert.equal(formatTemperature(-0.1), "0°");
  assert.equal(formatTemperature(-2.6), "-3°");
});
test("old collapsed layouts retain their order, gain the light before the text and clock/weather at the end", () => {
  const old = ["music", "text", "agents", "shelf", "mail"];
  assert.deepEqual(normalizeBehaviorSettings({ collapsedLayout: old }).collapsedLayout, ["music", "pulse", "text", "agents", "shelf", "mail", "clock", "weather"]);
  assert.deepEqual(normalizeBehaviorSettings({ collapsedLayout: ["clock", "text", "clock", "unknown"] }).collapsedLayout,
    ["clock", "pulse", "text", "mail", "shelf", "music", "agents", "weather"]);
  assert.deepEqual(normalizeBehaviorSettings({ collapsedLayout: ["text", "agents", "pulse"] }).collapsedLayout,
    ["text", "agents", "pulse", "mail", "shelf", "music", "clock", "weather"], "a moved light keeps its place");
  assert.deepEqual(normalizeBehaviorSettings({}).collapsedLayout[0], "pulse");
});

test("hidden slots are known ones, once each, never the text", () => {
  assert.deepEqual(normalizeCollapsedHidden(["mail", "text", "mail", "nope", "pulse"]), ["mail", "pulse"]);
  assert.deepEqual(normalizeCollapsedHidden("mail"), []);
  assert.deepEqual(normalizeBehaviorSettings({}).collapsedHidden, []);
  assert.deepEqual(visibleCollapsedSlots(["pulse", "text", "mail", "music"], ["mail"]), ["pulse", "text", "music"]);
});

test("arranging the editor keeps uninstalled plugin slots in their saved places", () => {
  const saved = ["clock", "pulse", "text", "music", "weather", "agents", "mail", "shelf"];
  assert.deepEqual(placeCollapsedLayout(saved, ["music", "pulse", "text", "agents", "mail"], ["clock", "weather"]),
    ["clock", "music", "pulse", "text", "weather", "agents", "mail", "shelf"]);
  assert.deepEqual(placeCollapsedLayout(saved, ["shelf", "text"], []), ["shelf", "text", "clock", "pulse", "music", "weather", "agents", "mail"]);
});

function mockClockWeatherStorage(t, initial) {
  const values = new Map(initial ? [[CLOCK_WEATHER_KEY, JSON.stringify(initial)]] : []);
  const previous = globalThis.window;
  globalThis.window = {
    localStorage: {
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => { values.set(key, value); },
    },
  };
  t.after(() => {
    if (previous === undefined) delete globalThis.window;
    else globalThis.window = previous;
  });
  return values;
}

test("each display toggle keeps a city and other preferences written by another window", (t) => {
  const values = mockClockWeatherStorage(t, { showClock: true, showWeather: true, location });
  const oldSettings = loadClockWeatherSettings();
  const newCity = { name: "深圳市 · 广东省", latitude: 22.54, longitude: 114.06 };
  values.set(CLOCK_WEATHER_KEY, JSON.stringify({ showClock: true, showWeather: false, location: newCity }));

  assert.equal(saveClockWeatherSettings({ showClock: !oldSettings.showClock }), true);
  assert.deepEqual(loadClockWeatherSettings(), { showClock: false, showWeather: false, location: newCity });
  assert.equal(saveClockWeatherSettings({ showWeather: true }), true);
  assert.deepEqual(loadClockWeatherSettings(), { showClock: false, showWeather: true, location: newCity });
});

test("the install defaults keep a city chosen after the market first read its settings", (t) => {
  const values = mockClockWeatherStorage(t);
  assert.equal(loadClockWeatherSettings().location, null);
  values.set(CLOCK_WEATHER_KEY, JSON.stringify({ showClock: false, showWeather: false, location }));

  assert.equal(saveClockWeatherSettings({ showClock: true, showWeather: true }), true);
  assert.deepEqual(loadClockWeatherSettings(), { showClock: true, showWeather: true, location });
});

test("a selected or located city keeps new display preferences and accepts long names and signed coordinates", (t) => {
  const values = mockClockWeatherStorage(t, { showClock: true, showWeather: true, location });
  const city = { name: `海港 · ${"城".repeat(220)}`, latitude: -33.86, longitude: -70.65 };
  values.set(CLOCK_WEATHER_KEY, JSON.stringify({ showClock: false, showWeather: false, location }));

  assert.equal(saveClockWeatherSettings({ location: city }), true);
  assert.deepEqual(loadClockWeatherSettings(), { showClock: false, showWeather: false, location: { ...city, name: city.name.slice(0, 200) } });
});

test("invalid location results and failed writes leave the persisted city available on reload", (t) => {
  const values = mockClockWeatherStorage(t, { showClock: true, showWeather: false, location });
  const previous = values.get(CLOCK_WEATHER_KEY);
  for (const result of [null, undefined, { ...location, name: " " }, { ...location, longitude: 181 }]) {
    assert.equal(saveClockWeatherSettings({ location: result }), false);
    assert.equal(values.get(CLOCK_WEATHER_KEY), previous);
  }
  globalThis.window.localStorage.setItem = () => { throw new Error("Quota exceeded"); };
  assert.equal(saveClockWeatherSettings({ location: { name: "Another city", latitude: -10, longitude: -20 } }), false);
  assert.deepEqual(loadClockWeatherSettings(), { showClock: true, showWeather: false, location });
});

test("a reading saved a hair away from the chosen point still matches the city", async () => {
  const { sameLocation, nextWeatherDelay, WEATHER_REFRESH_MS } = await import("../../src/features/weather/model.ts");
  const cache = { latitude: 39.9042, longitude: 116.4044, temperature: 20, code: 0, observedAt: 1000, fetchedAt: 1000 };
  const city = { name: "北京", latitude: 39.9, longitude: 116.4 };
  assert.equal(weatherForLocation(cache, city, 2000), cache);
  assert.equal(sameLocation({ latitude: 39.9, longitude: 116.4 }, { latitude: 39.92, longitude: 116.4 }), false);
  assert.equal(weatherForLocation(cache, { ...city, latitude: 31.2, longitude: 121.5 }, 2000), null);
  assert.deepEqual([1, 2, 3, 4, 0].map(nextWeatherDelay), [30_000, 120_000, 600_000, WEATHER_REFRESH_MS, WEATHER_REFRESH_MS]);
});

test("manual width is the whole island: weather hides first, then the clock, never widening", () => {
  // 240 wide with both: room is 240 - 36 - 64 = 140; clock 56 + weather 72 = 128 fits.
  assert.deepEqual(fitClockWeather(240, true, true), { clock: true, weather: true });
  // Larger font scales need more room, so the weather goes first.
  assert.deepEqual(fitClockWeather(240, true, true, 1.5), { clock: true, weather: false });
  assert.deepEqual(fitClockWeather(150, true, true), { clock: false, weather: false });
  assert.deepEqual(fitClockWeather(200, false, true), { clock: false, weather: true });
  // Without the plugin nothing is shown.
  assert.deepEqual(fitClockWeather(160, false, false), { clock: false, weather: false });
});
