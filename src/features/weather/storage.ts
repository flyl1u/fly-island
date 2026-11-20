import { readJson, writeJson } from "../../lib/storage.ts";
import {
  normalizeClockWeatherSettings, normalizeWeatherCache, normalizeWeatherLocation,
  type ClockWeatherSettings, type WeatherCache, type WeatherLocation,
} from "./model.ts";

export const CLOCK_WEATHER_KEY = "fly-island-clock-weather";
export const WEATHER_CACHE_KEY = "fly-island-weather-cache";
export const loadClockWeatherSettings = () => normalizeClockWeatherSettings(readJson(CLOCK_WEATHER_KEY));
export type ClockWeatherSettingsUpdate = Partial<Pick<ClockWeatherSettings, "showClock" | "showWeather">> & { location?: WeatherLocation };

export function saveClockWeatherSettings(update: ClockWeatherSettingsUpdate): boolean {
  // Another window may have saved settings since the caller last rendered.
  const current = loadClockWeatherSettings();
  if ("location" in update) {
    const location = normalizeWeatherLocation(update.location);
    if (!location) return false;
    current.location = location;
  }
  return writeJson(CLOCK_WEATHER_KEY, {
    ...current,
    showClock: update.showClock ?? current.showClock,
    showWeather: update.showWeather ?? current.showWeather,
  });
}
export const loadWeatherCache = () => normalizeWeatherCache(readJson(WEATHER_CACHE_KEY));
export const saveWeatherCache = (cache: WeatherCache) => writeJson(WEATHER_CACHE_KEY, cache);
