import { useEffect, useRef, useState } from "react";
import { LocateFixed } from "lucide-react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { SettingsGroup } from "../../components/settings/SettingsGroup";
import { SettingsToggleRow } from "../../components/settings/SettingsToggleRow";
import { SettingsRow } from "../../components/settings/SettingsRow";
import { SettingsInput } from "../../components/settings/SettingsInput";
import { SettingsLinkButton } from "../../components/settings/SettingsLinkButton";
import { useLocale, useTranslation } from "../../i18n";
import { getCurrentWeather, locateWeather, searchWeatherCities } from "./api";
import { formatTemperature, normalizeWeatherCache } from "./model";
import { saveWeatherCache } from "./storage";
import { setClockWeatherSettings, useClockWeather } from "./useClockWeather";
import { useCenteredClock } from "../centered-clock";
import type { WeatherLocation } from "./model";
import "./ClockWeatherSettingsGroup.css";

export function ClockWeatherSettingsGroup() {
  const { installed, settings } = useClockWeather();
  const centeredClock = useCenteredClock();
  const t = useTranslation().settings.plugins.clockWeather;
  const title = useTranslation().settings.plugins.market.items.clockWeather.name;
  const { locale } = useLocale();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<WeatherLocation[]>([]);
  const [status, setStatus] = useState<"idle" | "loading" | "empty" | "error" | "saveError">("idle");
  const [locationStatus, setLocationStatus] = useState<"idle" | "locating" | "ip" | "error">("idle");
  const [forecast, setForecast] = useState<{ state: "idle" | "loading" | "ok" | "error"; detail: string }>({ state: "idle", detail: "" });
  const [locationDetail, setLocationDetail] = useState("");
  const revision = useRef(0);
  // Fetch once for the chosen city: shows the reason when it fails, and saves the reading so the
  // island (another window) shows the weather within seconds instead of waiting for its own request.
  const city = settings.location;
  const cityKey = city ? `${city.latitude}/${city.longitude}` : "";
  useEffect(() => {
    if (!installed || !city || !settings.showWeather) { setForecast({ state: "idle", detail: "" }); return; }
    let cancelled = false;
    setForecast({ state: "loading", detail: "" });
    getCurrentWeather(city.latitude, city.longitude)
      .then((reading) => {
        if (cancelled) return;
        const cache = normalizeWeatherCache({ ...reading, latitude: city.latitude, longitude: city.longitude });
        if (cache) saveWeatherCache(cache);
        setForecast({ state: "ok", detail: formatTemperature(reading.temperature) });
      })
      .catch((error: unknown) => { if (!cancelled) setForecast({ state: "error", detail: String(error) }); });
    return () => { cancelled = true; };
    // The city object changes identity on every storage re-read; its coordinates are the key.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [installed, cityKey, settings.showWeather]);
  useEffect(() => () => { revision.current += 1; }, []);
  const saveCity = (location: WeatherLocation) => {
    if (!setClockWeatherSettings({ location })) {
      setStatus("saveError");
      return false;
    }
    setQuery("");
    setResults([]);
    setStatus("idle");
    return true;
  };
  const search = async () => {
    const token = ++revision.current;
    setResults([]);
    setStatus("loading");
    setLocationStatus("idle");
    try {
      const cities = await searchWeatherCities(query.trim(), locale);
      if (token !== revision.current) return;
      setResults(cities);
      setStatus(cities.length ? "idle" : "empty");
    } catch {
      if (token === revision.current) setStatus("error");
    }
  };
  const locate = async () => {
    const token = ++revision.current;
    setLocationStatus("locating");
    try {
      const result = await locateWeather(locale);
      if (token !== revision.current) return;
      const saved = saveCity(result.location);
      setLocationStatus(saved && result.source === "ip" ? "ip" : "idle");
    } catch (error) {
      if (token === revision.current) { setLocationDetail(String(error)); setLocationStatus("error"); }
    }
  };
  const openLocationSettings = () => {
    void openUrl("ms-settings:privacy-location").catch((error) => console.error("Failed to open Windows location settings", error));
  };
  if (!installed) return null;
  const centeredClockActive = centeredClock.installed && (centeredClock.settings.showTime || centeredClock.settings.showDate);
  return <SettingsGroup title={title} footer={centeredClockActive && settings.showClock ? t.clockReplaced : t.privacy}>
    {!centeredClockActive && <SettingsToggleRow title={t.showClock} checked={settings.showClock}
      onChange={(showClock) => { setClockWeatherSettings({ showClock }); }} />
    }
    <SettingsToggleRow title={t.showWeather} checked={settings.showWeather}
      onChange={(showWeather) => { setClockWeatherSettings({ showWeather }); }} />
    <SettingsRow title={t.city} description={<span className="clock-weather-settings__current">
      {settings.location ? t.currentCity(settings.location.name) : t.noCity}
    </span>}
      control={<span className="clock-weather-settings__actions">
        <SettingsLinkButton disabled={query.trim().length < 2 || status === "loading" || locationStatus === "locating"}
          onClick={() => { void search(); }}>{t.search}</SettingsLinkButton>
        <SettingsLinkButton disabled={locationStatus === "locating" || status === "loading"}
          onClick={() => { void locate(); }} ariaLabel={t.locate}>
          <LocateFixed size={15} strokeWidth={1.7} absoluteStrokeWidth aria-hidden="true" />
          {locationStatus === "locating" ? t.locating : t.locate}
        </SettingsLinkButton>
      </span>}>
      <SettingsInput aria-label={t.city} placeholder={settings.location ? t.otherCityPlaceholder : t.cityPlaceholder} value={query} maxLength={100}
        onChange={(event) => {
          revision.current += 1;
          setQuery(event.target.value); setResults([]); setStatus("idle"); setLocationStatus("idle");
        }}
        onKeyDown={(event) => {
          if (event.key !== "Enter") return;
          event.preventDefault(); event.stopPropagation();
          if (query.trim().length >= 2 && status !== "loading") void search();
        }} />
      <p className="clock-weather-settings__status" role="status" aria-live="polite">
        {status === "loading" ? t.searching : status === "empty" ? t.noCities : status === "error" ? t.searchFailed : ""}
      </p>
      {forecast.state === "loading" && <p className="clock-weather-settings__status" role="status" aria-live="polite">{t.weatherChecking}</p>}
      {forecast.state === "ok" && <p className="clock-weather-settings__status" role="status" aria-live="polite">{t.weatherOk(forecast.detail)}</p>}
      {forecast.state === "error" && <p className="clock-weather-settings__status clock-weather-settings__status--error" role="alert">{t.weatherFailed(forecast.detail)}</p>}
      {status === "saveError" && <p className="clock-weather-settings__status clock-weather-settings__status--error" role="alert">{t.saveFailed}</p>}
      {locationStatus === "locating" && <p className="clock-weather-settings__status" role="status" aria-live="polite">{t.locating}</p>}
      {locationStatus === "ip" && <p className="clock-weather-settings__status" role="status" aria-live="polite">{t.locatedByIp}</p>}
      {locationStatus === "error" && <div className="clock-weather-settings__location-error" role="alert">
        <p className="clock-weather-settings__status">{t.locationFailed}</p>
        {locationDetail && <p className="clock-weather-settings__status">{t.locationDetail(locationDetail)}</p>}
        <SettingsLinkButton onClick={openLocationSettings}>{t.openLocationSettings}</SettingsLinkButton>
      </div>}
      {results.length > 0 && <ul className="clock-weather-settings__cities">
        {results.map((city) => <li key={`${city.latitude}/${city.longitude}`}>
          <button type="button" onClick={() => {
            revision.current += 1;
            setLocationStatus("idle");
            saveCity(city);
          }}>{city.name}</button>
        </li>)}
      </ul>}
    </SettingsRow>
  </SettingsGroup>;
}
