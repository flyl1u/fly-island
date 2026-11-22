export type ClockWeatherText = {
  showClock: string; showWeather: string; city: string; currentCity: (name: string) => string;
  noCity: string; cityPlaceholder: string; otherCityPlaceholder: string;
  search: string; searching: string; noCities: string; searchFailed: string; saveFailed: string; privacy: string; clockReplaced: string;
  locate: string; locating: string; locatedByIp: string; locationFailed: string; openLocationSettings: string;
  timeLabel: (time: string) => string;
  weatherLabel: (city: string, condition: string, temperature: string) => string;
  conditions: Record<"clear" | "partlyCloudy" | "cloudy" | "fog" | "drizzle" | "rain" | "freezingRain" | "snow" | "showers" | "snowShowers" | "thunderstorm" | "unknown", string>;
};
export const zhCN: ClockWeatherText = {
  showClock: "在岛上显示时间", showWeather: "在岛上显示天气", city: "城市",
  currentCity: (name) => `当前：${name}`, noCity: "未选择", cityPlaceholder: "搜索城市", otherCityPlaceholder: "搜索其他城市",
  search: "搜索", searching: "正在搜索城市…",
  noCities: "没有找到城市，请换个名称试试。", searchFailed: "暂时无法搜索城市，请稍后重试。",
  saveFailed: "未能保存城市，请重试。",
  locate: "定位", locating: "正在定位…", locatedByIp: "已按网络位置定位到城市。如果不对（例如开了代理），直接在上面搜索城市。",
  locationFailed: "定位失败。请在 Windows 设置中开启定位后重试。", openLocationSettings: "打开定位设置",
  privacy: "天气由 Open-Meteo 提供，每 30 分钟刷新。只有点击定位时才会读取位置；网络兜底为大致位置。",
  clockReplaced: "居中时钟已接管时间显示；天气照常显示。卸载居中时钟后，原时间位会恢复。",
  timeLabel: (time) => `当前时间 ${time}`,
  weatherLabel: (city, condition, temperature) => `${city} · ${condition} · ${temperature}C`,
  conditions: { clear: "晴", partlyCloudy: "晴间多云", cloudy: "阴", fog: "雾", drizzle: "毛毛雨",
    rain: "雨", freezingRain: "冻雨", snow: "雪", showers: "阵雨", snowShowers: "阵雪", thunderstorm: "雷雨", unknown: "天气" },
};
export const en: ClockWeatherText = {
  showClock: "Show time on the island", showWeather: "Show weather on the island", city: "City",
  currentCity: (name) => `Current: ${name}`, noCity: "No city selected", cityPlaceholder: "Search for a city", otherCityPlaceholder: "Search for another city",
  search: "Search", searching: "Searching cities…",
  noCities: "No cities found. Try another name.", searchFailed: "City search is unavailable. Please try again later.",
  saveFailed: "Couldn't save the city. Try again.",
  locate: "Locate", locating: "Locating…", locatedByIp: "Located your city from your network. If it's wrong (for example behind a VPN), search for your city above.",
  locationFailed: "Location failed. Turn on Windows location in Settings and try again.", openLocationSettings: "Open location settings",
  privacy: "Weather by Open-Meteo, refreshed every 30 minutes. Location is read only when you click Locate; the network fallback is approximate.",
  clockReplaced: "Centered Clock owns the time display while active; weather still works. Removing it restores this clock.",
  timeLabel: (time) => `Current time ${time}`,
  weatherLabel: (city, condition, temperature) => `${city} · ${condition} · ${temperature}C`,
  conditions: { clear: "Clear", partlyCloudy: "Partly cloudy", cloudy: "Overcast", fog: "Fog", drizzle: "Drizzle",
    rain: "Rain", freezingRain: "Freezing rain", snow: "Snow", showers: "Rain showers", snowShowers: "Snow showers", thunderstorm: "Thunderstorm", unknown: "Weather" },
};
