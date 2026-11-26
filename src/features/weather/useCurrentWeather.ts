import { useCallback, useSyncExternalStore } from "react";
import { getCurrentWeather } from "./api";
import { WEATHER_MAX_AGE_MS, nextWeatherDelay, weatherForLocation, normalizeWeatherCache, type WeatherCache, type WeatherLocation } from "./model";
import { loadWeatherCache, saveWeatherCache, WEATHER_CACHE_KEY } from "./storage";

function weatherStore(location: WeatherLocation) {
  let value = weatherForLocation(loadWeatherCache(), location);
  let poll = 0;
  let expiry = 0;
  let generation = 0;
  let failures = 0;
  let pending: ReturnType<typeof getCurrentWeather> | null = null;
  const listeners = new Set<() => void>();
  const emit = () => listeners.forEach((listener) => listener());
  const expire = () => {
    window.clearTimeout(expiry);
    if (!value) return;
    expiry = window.setTimeout(() => {
      value = null;
      emit();
    }, Math.max(1, Math.min(value.observedAt, value.fetchedAt) + WEATHER_MAX_AGE_MS - Date.now() + 1));
  };
  const refresh = async () => {
    const token = generation;
    try {
      const request = pending ??= getCurrentWeather(location.latitude, location.longitude);
      const result = await request.finally(() => { if (pending === request) pending = null; });
      if (token !== generation || !listeners.size) return;
      const next = normalizeWeatherCache({ ...result, latitude: location.latitude, longitude: location.longitude });
      if (next && weatherForLocation(next, location)) {
        value = next;
        saveWeatherCache(next);
        expire();
        emit();
      }
      failures = 0;
    } catch {
      // Offline weather is deliberately quiet. A valid previous reading stays until its expiry,
      // and the next try comes soon (30 s, 2 min, 10 min) instead of after a whole refresh period.
      failures += 1;
    }
    if (token === generation && listeners.size) poll = window.setTimeout(() => { void refresh(); }, nextWeatherDelay(failures));
  };
  const onStorage = (event: StorageEvent) => {
    if (event.key !== null && event.key !== WEATHER_CACHE_KEY) return;
    const next = weatherForLocation(loadWeatherCache(), location);
    if (next && (!value || next.fetchedAt > value.fetchedAt)) { value = next; expire(); emit(); }
  };
  return {
    snapshot: () => value,
    subscribe(listener: () => void) {
      listeners.add(listener);
      if (listeners.size === 1) {
        generation += 1;
        failures = 0;
        value = weatherForLocation(loadWeatherCache(), location);
        expire();
        window.addEventListener("storage", onStorage);
        const remaining = value ? nextWeatherDelay(0) - (Date.now() - value.fetchedAt) : 0;
        if (remaining <= 0) void refresh();
        else poll = window.setTimeout(() => { void refresh(); }, remaining);
      }
      return () => {
        listeners.delete(listener);
        if (!listeners.size) {
          generation += 1;
          window.clearTimeout(poll);
          window.clearTimeout(expiry);
          window.removeEventListener("storage", onStorage);
        }
      };
    },
  };
}
const stores = new Map<string, ReturnType<typeof weatherStore>>();
const none = () => null;
const noSubscription = () => () => {};
/** One request/timer per location in this window, shared by the leaf and low-frequency sizing. */
export function useCurrentWeather(enabled: boolean, location: WeatherLocation | null): WeatherCache | null {
  const key = enabled && location ? `${location.latitude}/${location.longitude}` : "";
  if (key && location && !stores.has(key)) stores.set(key, weatherStore(location));
  const store = stores.get(key);
  const subscribe = useCallback((listener: () => void) => store ? store.subscribe(listener) : noSubscription(), [store]);
  return useSyncExternalStore(subscribe, store?.snapshot ?? none, none);
}
