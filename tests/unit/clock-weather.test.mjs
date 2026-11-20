import test from "node:test";
import assert from "node:assert/strict";
import { normalizeClockWeatherSettings, normalizeWeatherCache, normalizeWeatherLocation, weatherForLocation, weatherCondition,
  WEATHER_MAX_AGE_MS, clockWeatherWidth, formatClock, nextMinuteDelay, formatTemperature } from "../../src/features/weather/model.ts";
import { mergeVisibleCollapsedLayout } from "../../src/features/appearance/collapsedLayout.ts";
import { normalizeBehaviorSettings } from "../../src/features/appearance/normalizeBehaviorSettings.ts";

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
test("old collapsed layouts retain their order and gain clock/weather only at the end", () => {
  const old = ["music", "text", "agents", "shelf", "mail"];
  assert.deepEqual(normalizeBehaviorSettings({ collapsedLayout: old }).collapsedLayout, [...old, "clock", "weather"]);
  assert.deepEqual(normalizeBehaviorSettings({ collapsedLayout: ["clock", "text", "clock", "unknown"] }).collapsedLayout,
    ["clock", "text", "mail", "shelf", "music", "agents", "weather"]);
});

test("status sizing reserves fixed clock/weather space and respects actual content at manual widths", () => {
  assert.equal(clockWeatherWidth(280, false, false, 1, 400), 280);
  assert.equal(clockWeatherWidth(280, true, false), 336);
  assert.equal(clockWeatherWidth(280, false, true), 352);
  assert.equal(clockWeatherWidth(340, true, true, 1.2), 480);
  assert.equal(clockWeatherWidth(240, true, true, 1, 432), 432);
});

test("reordering visible slots retains the saved indices of uninstalled plugin slots", () => {
  const saved = ["clock", "text", "music", "weather", "agents", "mail", "shelf"];
  assert.deepEqual(mergeVisibleCollapsedLayout(saved, ["music", "text", "agents", "mail", "shelf"]),
    ["clock", "music", "text", "weather", "agents", "mail", "shelf"]);
});
