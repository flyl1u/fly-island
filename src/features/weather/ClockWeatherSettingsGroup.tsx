import { useEffect, useRef, useState } from "react";
import { SettingsGroup } from "../../components/settings/SettingsGroup";
import { SettingsToggleRow } from "../../components/settings/SettingsToggleRow";
import { SettingsRow } from "../../components/settings/SettingsRow";
import { SettingsInput } from "../../components/settings/SettingsInput";
import { SettingsLinkButton } from "../../components/settings/SettingsLinkButton";
import { useLocale, useTranslation } from "../../i18n";
import { searchWeatherCities } from "./api";
import { setClockWeatherSettings, useClockWeather } from "./useClockWeather";
import type { WeatherLocation } from "./model";
import "./ClockWeatherSettingsGroup.css";

export function ClockWeatherSettingsGroup() {
  const { installed, settings } = useClockWeather();
  const t = useTranslation().settings.plugins.clockWeather;
  const title = useTranslation().settings.plugins.market.items.clockWeather.name;
  const { locale } = useLocale();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<WeatherLocation[]>([]);
  const [status, setStatus] = useState<"idle" | "loading" | "empty" | "error">("idle");
  const revision = useRef(0);
  useEffect(() => () => { revision.current += 1; }, []);
  const search = async () => {
    const token = ++revision.current;
    setResults([]);
    setStatus("loading");
    try {
      const cities = await searchWeatherCities(query.trim(), locale);
      if (token !== revision.current) return;
      setResults(cities);
      setStatus(cities.length ? "idle" : "empty");
    } catch {
      if (token === revision.current) setStatus("error");
    }
  };
  if (!installed) return null;
  return <SettingsGroup title={title} footer={t.privacy}>
    <SettingsToggleRow title={t.showClock} checked={settings.showClock}
      onChange={(showClock) => setClockWeatherSettings({ ...settings, showClock })} />
    <SettingsToggleRow title={t.showWeather} checked={settings.showWeather}
      onChange={(showWeather) => setClockWeatherSettings({ ...settings, showWeather })} />
    <SettingsRow title={t.city} description={settings.location?.name ?? t.chooseCity}
      control={<SettingsLinkButton disabled={query.trim().length < 2 || status === "loading"}
        onClick={() => { void search(); }}>{t.search}</SettingsLinkButton>}>
      <SettingsInput aria-label={t.city} placeholder={t.cityPlaceholder} value={query} maxLength={100}
        onChange={(event) => {
          revision.current += 1;
          setQuery(event.target.value); setResults([]); setStatus("idle");
        }}
        onKeyDown={(event) => {
          if (event.key !== "Enter") return;
          event.preventDefault(); event.stopPropagation();
          if (query.trim().length >= 2 && status !== "loading") void search();
        }} />
      <p className="clock-weather-settings__status" role="status" aria-live="polite">
        {status === "loading" ? t.searching : status === "empty" ? t.noCities : status === "error" ? t.searchFailed : ""}
      </p>
      {results.length > 0 && <ul className="clock-weather-settings__cities">
        {results.map((city) => <li key={`${city.latitude}/${city.longitude}`}>
          <button type="button" onClick={() => {
            revision.current += 1;
            setClockWeatherSettings({ ...settings, location: city });
            setQuery(""); setResults([]); setStatus("idle");
          }}>{city.name}</button>
        </li>)}
      </ul>}
    </SettingsRow>
  </SettingsGroup>;
}
