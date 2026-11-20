import { invoke } from "@tauri-apps/api/core";
import type { WeatherLocation, WeatherReading } from "./model";

// Rust: weather/mod.rs WeatherCity and CurrentWeather (camelCase; timestamps are Unix milliseconds).
export function searchWeatherCities(name: string, language: "zh-CN" | "en"): Promise<WeatherLocation[]> {
  return invoke("search_weather_cities", { name, language: language === "zh-CN" ? "zh" : "en" });
}
export function getCurrentWeather(latitude: number, longitude: number): Promise<WeatherReading> {
  return invoke("get_current_weather", { latitude, longitude });
}
