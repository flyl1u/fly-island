import { Cloud, CloudDrizzle, CloudFog, CloudHail, CloudLightning, CloudRain, CloudRainWind, CloudSnow, CloudSun, Snowflake, Sun } from "lucide-react";
import { weatherCondition, type WeatherCondition } from "./model";

const ICONS = {
  clear: Sun, partlyCloudy: CloudSun, cloudy: Cloud, fog: CloudFog, drizzle: CloudDrizzle,
  rain: CloudRain, freezingRain: CloudHail, snow: Snowflake, showers: CloudRainWind,
  snowShowers: CloudSnow, thunderstorm: CloudLightning, unknown: Cloud,
} satisfies Record<WeatherCondition, typeof Sun>;
export function WeatherIcon({ code, size = 15 }: { code: number; size?: number }) {
  const Icon = ICONS[weatherCondition(code)];
  return <Icon size={size} strokeWidth={1.5} absoluteStrokeWidth aria-hidden="true" />;
}
