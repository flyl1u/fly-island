use reqwest::{redirect::Policy, Client};
use serde::{Deserialize, Serialize};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WeatherCity {
    name: String,
    latitude: f64,
    longitude: f64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CurrentWeather {
    temperature: f64,
    code: u8,
    observed_at: u64,
    fetched_at: u64,
}

#[derive(Deserialize)]
struct Geocoding {
    #[serde(default)]
    results: Vec<City>,
}
#[derive(Deserialize)]
struct City {
    name: String,
    latitude: f64,
    longitude: f64,
    admin1: Option<String>,
    country: Option<String>,
}
#[derive(Deserialize)]
struct Forecast {
    current: Observation,
}
#[derive(Deserialize)]
struct Observation {
    temperature_2m: f64,
    weather_code: u8,
    time: u64,
}

fn coordinates(latitude: f64, longitude: f64) -> Result<(), String> {
    if latitude.is_finite()
        && longitude.is_finite()
        && latitude.abs() <= 90.0
        && longitude.abs() <= 180.0
    {
        Ok(())
    } else {
        Err("Invalid weather coordinates.".into())
    }
}
fn client() -> Result<Client, String> {
    Client::builder()
        .timeout(Duration::from_secs(12))
        .redirect(Policy::none())
        .build()
        .map_err(|error| format!("Could not create weather request: {error}"))
}
async fn response(request: reqwest::RequestBuilder) -> Result<Vec<u8>, String> {
    let mut response = request
        .send()
        .await
        .map_err(|error| format!("Weather request failed: {error}"))?
        .error_for_status()
        .map_err(|error| format!("Weather service unavailable: {error}"))?;
    let mut data = Vec::new();
    while let Some(chunk) = response
        .chunk()
        .await
        .map_err(|error| format!("Could not read weather: {error}"))?
    {
        if data.len() + chunk.len() > 256 * 1024 {
            return Err("Weather response is too large.".into());
        }
        data.extend_from_slice(&chunk);
    }
    Ok(data)
}
fn cities(data: &[u8]) -> Result<Vec<WeatherCity>, String> {
    let result: Geocoding =
        serde_json::from_slice(data).map_err(|error| format!("Invalid city result: {error}"))?;
    Ok(result
        .results
        .into_iter()
        .filter_map(|city| {
            coordinates(city.latitude, city.longitude).ok()?;
            let mut names = vec![city.name.trim().to_string()];
            if names[0].is_empty() {
                return None;
            }
            for name in [city.admin1, city.country].into_iter().flatten() {
                let name = name.trim();
                if !name.is_empty() && !names.iter().any(|part| part == name) {
                    names.push(name.to_string());
                }
            }
            Some(WeatherCity {
                name: names.join(" · "),
                latitude: city.latitude,
                longitude: city.longitude,
            })
        })
        .take(8)
        .collect())
}
fn reading(data: &[u8], fetched_at: u64) -> Result<CurrentWeather, String> {
    let result: Forecast =
        serde_json::from_slice(data).map_err(|error| format!("Invalid weather result: {error}"))?;
    let current = result.current;
    let observed_at = current
        .time
        .checked_mul(1000)
        .ok_or("Invalid weather time.")?;
    if !current.temperature_2m.is_finite()
        || current.temperature_2m.abs() > 150.0
        || observed_at == 0
    {
        return Err("Invalid weather observation.".into());
    }
    Ok(CurrentWeather {
        temperature: current.temperature_2m,
        code: current.weather_code,
        observed_at,
        fetched_at,
    })
}

#[tauri::command]
pub async fn search_weather_cities(
    name: String,
    language: String,
) -> Result<Vec<WeatherCity>, String> {
    let name = name.trim();
    if !(2..=100).contains(&name.chars().count()) {
        return Err("Enter a city name (2–100 characters).".into());
    }
    let language = if language == "zh" { "zh" } else { "en" };
    let mut url = reqwest::Url::parse("https://geocoding-api.open-meteo.com/v1/search")
        .map_err(|error| error.to_string())?;
    url.query_pairs_mut().extend_pairs([
        ("name", name),
        ("language", language),
        ("count", "8"),
        ("format", "json"),
    ]);
    let data = response(client()?.get(url)).await?;
    cities(&data)
}
#[tauri::command]
pub async fn get_current_weather(latitude: f64, longitude: f64) -> Result<CurrentWeather, String> {
    coordinates(latitude, longitude)?;
    let mut url = reqwest::Url::parse("https://api.open-meteo.com/v1/forecast")
        .map_err(|error| error.to_string())?;
    url.query_pairs_mut().extend_pairs([
        ("latitude", latitude.to_string()),
        ("longitude", longitude.to_string()),
        ("current", "temperature_2m,weather_code".into()),
        ("temperature_unit", "celsius".into()),
        ("timeformat", "unixtime".into()),
    ]);
    let data = response(client()?.get(url)).await?;
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|error| error.to_string())?
        .as_millis() as u64;
    reading(&data, now)
}

macro_rules! tauri_commands {
    ($next:ident [$($done:tt)*] $($rest:tt)*) => {
        $next!([$($done)* crate::weather::search_weather_cities, crate::weather::get_current_weather,] $($rest)*)
    };
}
pub(crate) use tauri_commands;

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn validates_coordinates() {
        assert!(coordinates(90.0, -180.0).is_ok());
        for (lat, lon) in [
            (91.0, 0.0),
            (0.0, 181.0),
            (f64::NAN, 0.0),
            (0.0, f64::INFINITY),
        ] {
            assert!(coordinates(lat, lon).is_err());
        }
    }
    #[test]
    fn parses_cities_and_empty_results() {
        assert!(cities(b"{}").unwrap().is_empty());
        let list = cities(br#"{"results":[{"name":"Beijing","latitude":39.9,"longitude":116.4,"admin1":"Beijing","country":"China"},{"name":"invalid","latitude":999,"longitude":0}]}"#).unwrap();
        assert_eq!(list.len(), 1);
        assert_eq!(list[0].name, "Beijing · China");
        assert!(cities(b"not json").is_err());
    }
    #[test]
    fn observation_uses_service_time_in_milliseconds() {
        let current = reading(
            br#"{"current":{"temperature_2m":-2.5,"weather_code":71,"time":1795089600}}"#,
            1795089700000,
        )
        .unwrap();
        assert_eq!(current.temperature, -2.5);
        assert_eq!(current.code, 71);
        assert_eq!(current.observed_at, 1795089600000);
        assert_eq!(current.fetched_at, 1795089700000);
        assert!(reading(
            br#"{"current":{"temperature_2m":999,"weather_code":0,"time":1}}"#,
            1
        )
        .is_err());
        assert!(reading(br#"{"current":{"weather_code":0,"time":1}}"#, 1).is_err());
    }
}
