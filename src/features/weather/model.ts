export type WeatherLocation = { name: string; latitude: number; longitude: number };
export type ClockWeatherSettings = { showClock: boolean; showWeather: boolean; location: WeatherLocation | null };
export type WeatherReading = { temperature: number; code: number; observedAt: number; fetchedAt: number };
export type WeatherCache = WeatherReading & { latitude: number; longitude: number };
export type WeatherCondition = "clear" | "partlyCloudy" | "cloudy" | "fog" | "drizzle" | "rain" | "freezingRain" | "snow" | "showers" | "snowShowers" | "thunderstorm" | "unknown";

export const WEATHER_REFRESH_MS = 30 * 60_000;
export const WEATHER_MAX_AGE_MS = 3 * 60 * 60_000;

function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
export function validCoordinates(latitude: unknown, longitude: unknown): boolean {
  return typeof latitude === "number" && Number.isFinite(latitude) && Math.abs(latitude) <= 90
    && typeof longitude === "number" && Number.isFinite(longitude) && Math.abs(longitude) <= 180;
}
export function normalizeWeatherLocation(value: unknown): WeatherLocation | null {
  const item = record(value);
  if (typeof item.name !== "string" || !item.name.trim() || !validCoordinates(item.latitude, item.longitude)) return null;
  return { name: item.name.trim().slice(0, 200), latitude: item.latitude as number, longitude: item.longitude as number };
}
export function normalizeClockWeatherSettings(value: unknown): ClockWeatherSettings {
  const item = record(value);
  return { showClock: item.showClock !== false, showWeather: item.showWeather !== false, location: normalizeWeatherLocation(item.location) };
}
export function normalizeWeatherCache(value: unknown): WeatherCache | null {
  const item = record(value);
  if (!validCoordinates(item.latitude, item.longitude)
    || typeof item.temperature !== "number" || !Number.isFinite(item.temperature) || Math.abs(item.temperature) > 150
    || typeof item.code !== "number" || !Number.isInteger(item.code) || item.code < 0 || item.code > 255
    || typeof item.observedAt !== "number" || !Number.isFinite(item.observedAt) || item.observedAt <= 0
    || typeof item.fetchedAt !== "number" || !Number.isFinite(item.fetchedAt) || item.fetchedAt <= 0) return null;
  return { latitude: item.latitude as number, longitude: item.longitude as number,
    temperature: item.temperature, code: item.code, observedAt: item.observedAt, fetchedAt: item.fetchedAt };
}
/**
 * Coordinates that differ by less than this (about 550 m) are the same place: the located or
 * searched point and the one saved with a reading can differ by rounding, and an exact
 * comparison then never matched, so a successful reading was never shown.
 */
export const SAME_PLACE_DEGREES = 0.005;
export function sameLocation(a: { latitude: number; longitude: number }, b: { latitude: number; longitude: number }): boolean {
  return Math.abs(a.latitude - b.latitude) < SAME_PLACE_DEGREES && Math.abs(a.longitude - b.longitude) < SAME_PLACE_DEGREES;
}

/** Waits before retrying after the 1st, 2nd, 3rd failure in a row; later ones use the normal refresh. */
export const WEATHER_RETRY_MS = [30_000, 2 * 60_000, 10 * 60_000] as const;
export function nextWeatherDelay(failures: number): number {
  if (failures <= 0) return WEATHER_REFRESH_MS;
  return WEATHER_RETRY_MS[failures - 1] ?? WEATHER_REFRESH_MS;
}

export function weatherForLocation(cache: WeatherCache | null, location: WeatherLocation | null, now = Date.now()): WeatherCache | null {
  if (!cache || !location || !sameLocation(cache, location)) return null;
  // Reject future timestamps too: a corrupt cache must not remain visible indefinitely.
  if (Math.max(cache.observedAt, cache.fetchedAt) > now + 60_000) return null;
  const age = now - Math.min(cache.observedAt, cache.fetchedAt);
  return age >= -60_000 && age <= WEATHER_MAX_AGE_MS ? cache : null;
}
/** WMO codes used by Open-Meteo, independent of React and localization. */
export function weatherCondition(code: number): WeatherCondition {
  if (code === 0) return "clear";
  if (code === 1 || code === 2) return "partlyCloudy";
  if (code === 3) return "cloudy";
  if (code === 45 || code === 48) return "fog";
  if ([51, 53, 55].includes(code)) return "drizzle";
  if ([56, 57, 66, 67].includes(code)) return "freezingRain";
  if ([61, 63, 65].includes(code)) return "rain";
  if ([71, 73, 75, 77].includes(code)) return "snow";
  if ([80, 81, 82].includes(code)) return "showers";
  if ([85, 86].includes(code)) return "snowShowers";
  if ([95, 96, 99].includes(code)) return "thunderstorm";
  return "unknown";
}
export function formatClock(date: Date) {
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}
export function nextMinuteDelay(now: number) { return 60_000 - (now % 60_000); }
export function formatTemperature(temperature: number) { return `${Math.round(temperature) || 0}°`; }

/**
 * Manual width: the user's width is the whole island. The time and weather share it with the text
 * (side space 36 and at least 64 for the text); when they do not fit, the weather goes first, then
 * the time. Other slots (mail, music…) are not counted here.
 */
export function fitClockWeather(width: number, clock: boolean, weather: boolean, fontScale = 1) {
  const room = width - 36 - 64 * fontScale;
  const clockRoom = 48 * fontScale + 8;
  const weatherRoom = 64 * fontScale + 8;
  if (clock && weather && room >= clockRoom + weatherRoom) return { clock: true, weather: true };
  if (clock && room >= clockRoom) return { clock: true, weather: false };
  if (weather && !clock && room >= weatherRoom) return { clock: false, weather: true };
  return { clock: false, weather: false };
}

