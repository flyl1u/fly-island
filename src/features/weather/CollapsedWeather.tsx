import { useTranslation } from "../../i18n";
import { formatTemperature, weatherCondition, type WeatherLocation, type WeatherReading } from "./model";
import { WeatherIcon } from "./WeatherIcon";
import "./CollapsedWeather.css";

export function CollapsedWeather({ location, reading }: { location: WeatherLocation; reading: WeatherReading }) {
  const t = useTranslation().settings.plugins.clockWeather;
  const label = t.weatherLabel(location.name, t.conditions[weatherCondition(reading.code)], formatTemperature(reading.temperature));
  return <span className="collapsed-weather" aria-label={label} title={label}>
    <WeatherIcon code={reading.code} /><span>{formatTemperature(reading.temperature)}</span>
  </span>;
}
