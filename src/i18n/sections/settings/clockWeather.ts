export type ClockWeatherText = {
  showClock: string; showWeather: string; city: string; chooseCity: string; cityPlaceholder: string;
  search: string; searching: string; noCities: string; searchFailed: string; privacy: string;
  timeLabel: (time: string) => string;
  weatherLabel: (city: string, condition: string, temperature: string) => string;
  conditions: Record<"clear" | "partlyCloudy" | "cloudy" | "fog" | "drizzle" | "rain" | "freezingRain" | "snow" | "showers" | "snowShowers" | "thunderstorm" | "unknown", string>;
};
export const zhCN: ClockWeatherText = {
  showClock: "在岛上显示时间", showWeather: "在岛上显示天气", city: "天气位置",
  chooseCity: "选择城市后显示天气", cityPlaceholder: "输入城市名称", search: "搜索", searching: "正在搜索城市…",
  noCities: "没有找到城市，请换个名称试试。", searchFailed: "暂时无法搜索城市，请稍后重试。",
  privacy: "天气由 Open-Meteo 提供，每 30 分钟刷新。只查询你选择的城市，不自动定位。",
  timeLabel: (time) => `当前时间 ${time}`,
  weatherLabel: (city, condition, temperature) => `${city} · ${condition} · ${temperature}C`,
  conditions: { clear: "晴", partlyCloudy: "晴间多云", cloudy: "阴", fog: "雾", drizzle: "毛毛雨",
    rain: "雨", freezingRain: "冻雨", snow: "雪", showers: "阵雨", snowShowers: "阵雪", thunderstorm: "雷雨", unknown: "天气" },
};
export const en: ClockWeatherText = {
  showClock: "Show time on the island", showWeather: "Show weather on the island", city: "Weather location",
  chooseCity: "Choose a city to show weather", cityPlaceholder: "Enter a city name", search: "Search", searching: "Searching cities…",
  noCities: "No cities found. Try another name.", searchFailed: "City search is unavailable. Please try again later.",
  privacy: "Weather by Open-Meteo, refreshed every 30 minutes. Only your chosen city is queried; no automatic location.",
  timeLabel: (time) => `Current time ${time}`,
  weatherLabel: (city, condition, temperature) => `${city} · ${condition} · ${temperature}C`,
  conditions: { clear: "Clear", partlyCloudy: "Partly cloudy", cloudy: "Overcast", fog: "Fog", drizzle: "Drizzle",
    rain: "Rain", freezingRain: "Freezing rain", snow: "Snow", showers: "Rain showers", snowShowers: "Snow showers", thunderstorm: "Thunderstorm", unknown: "Weather" },
};
