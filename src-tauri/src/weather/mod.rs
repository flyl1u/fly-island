mod aliases;
mod diagnostics;

use reqwest::{redirect::Policy, Client};
use serde::{Deserialize, Serialize};
use std::{
    sync::mpsc,
    time::{Duration, SystemTime, UNIX_EPOCH},
};
use tauri::AppHandle;
use windows::Devices::Geolocation::{GeolocationAccessStatus, Geolocator};

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

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LocatedWeather {
    location: WeatherCity,
    source: String,
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
    #[serde(default)]
    feature_code: Option<String>,
    #[serde(default)]
    population: Option<u64>,
    admin1: Option<String>,
    admin2: Option<String>,
    admin3: Option<String>,
    admin4: Option<String>,
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

async fn main_thread_value<T, F>(app: &AppHandle, callback: F) -> Result<T, String>
where
    T: Send + 'static,
    F: FnOnce() -> windows::core::Result<T> + Send + 'static,
{
    let (sender, receiver) = mpsc::sync_channel(1);
    app.run_on_main_thread(move || {
        let _ = sender.send(callback());
    })
    .map_err(|error| format!("Could not start Windows location: {error}"))?;
    tauri::async_runtime::spawn_blocking(move || receiver.recv_timeout(Duration::from_secs(5)))
        .await
        .map_err(|error| format!("Windows location thread failed: {error}"))?
        .map_err(|error| format!("Could not start Windows location: {error}"))?
        .map_err(|error| format!("Windows location request failed: {error}"))
}

async fn windows_coordinates(app: &AppHandle) -> Result<(f64, f64), String> {
    let access_operation = main_thread_value(app, Geolocator::RequestAccessAsync).await?;
    let access = tokio::time::timeout(Duration::from_secs(10), access_operation)
        .await
        .map_err(|_| "Windows location permission request timed out.".to_string())?
        .map_err(|error| format!("Windows location permission request failed: {error}"))?;
    if access != GeolocationAccessStatus::Allowed {
        return Err("Windows location is disabled or permission was denied.".into());
    }
    let position_operation = main_thread_value(app, || {
        let locator = Geolocator::new()?;
        locator.GetGeopositionAsync()
    })
    .await?;
    let position = tokio::time::timeout(Duration::from_secs(8), position_operation)
        .await
        .map_err(|_| "Windows location request timed out.".to_string())?
        .map_err(|error| format!("Windows location request failed: {error}"))?;
    let point = position
        .Coordinate()
        .and_then(|coordinate| coordinate.Point())
        .and_then(|point| point.Position())
        .map_err(|error| format!("Windows location returned no coordinates: {error}"))?;
    coordinates(point.Latitude, point.Longitude)?;
    Ok((point.Latitude, point.Longitude))
}

#[derive(Deserialize)]
struct NominatimResponse {
    address: Option<NominatimAddress>,
}

#[derive(Deserialize)]
struct NominatimAddress {
    city: Option<String>,
    town: Option<String>,
    village: Option<String>,
    municipality: Option<String>,
    county: Option<String>,
    region: Option<String>,
    state: Option<String>,
    country: Option<String>,
}

fn address_city(
    address: NominatimAddress,
    latitude: f64,
    longitude: f64,
    language: &str,
) -> Option<WeatherCity> {
    let city = [
        address.city,
        address.town,
        address.village,
        address.municipality,
        address.county,
        address.region,
    ]
    .into_iter()
    .flatten()
    .find(|value| !value.trim().is_empty())?;
    let city = clean_name(Some(&city), language)?;
    let mut parts = vec![city];
    for value in [address.state, address.country].into_iter().flatten() {
        let Some(value) = clean_name(Some(&value), language) else {
            continue;
        };
        if !parts.iter().any(|part| name_key(part) == name_key(&value)) {
            parts.push(value);
        }
    }
    Some(WeatherCity {
        name: parts.join(" · "),
        latitude,
        longitude,
    })
}

async fn reverse_geocode(
    latitude: f64,
    longitude: f64,
    language: &str,
) -> Result<Option<WeatherCity>, String> {
    let mut url = reqwest::Url::parse("https://nominatim.openstreetmap.org/reverse")
        .map_err(|error| error.to_string())?;
    url.query_pairs_mut().extend_pairs([
        ("format", "jsonv2"),
        ("zoom", "10"),
        ("lat", &latitude.to_string()),
        ("lon", &longitude.to_string()),
        (
            "accept-language",
            if language == "zh" { "zh-CN" } else { "en" },
        ),
    ]);
    let data = response(
        client()?
            .get(url)
            .header("User-Agent", "Fly-Island weather location"),
    )
    .await?;
    let result: NominatimResponse = serde_json::from_slice(&data)
        .map_err(|error| format!("Invalid reverse geocoding result: {error}"))?;
    Ok(result
        .address
        .and_then(|address| address_city(address, latitude, longitude, language)))
}

#[derive(Deserialize)]
struct NominatimSearchItem {
    lat: String,
    lon: String,
    name: Option<String>,
    address: Option<NominatimAddress>,
}

fn needs_search_supplement(data: &[u8]) -> bool {
    let Ok(result) = serde_json::from_slice::<Geocoding>(data) else {
        return false;
    };
    !result.results.iter().any(|city| {
        feature_rank(city.feature_code.as_deref()) >= 95 || city.population.unwrap_or(0) >= 100_000
    })
}

async fn supplement_city_search(
    query: &str,
    language: &str,
) -> Result<Option<WeatherCity>, String> {
    let mut url = reqwest::Url::parse("https://nominatim.openstreetmap.org/search")
        .map_err(|error| error.to_string())?;
    url.query_pairs_mut().extend_pairs([
        ("format", "jsonv2"),
        ("limit", "8"),
        ("addressdetails", "1"),
        ("q", query),
        (
            "accept-language",
            if language == "zh" { "zh-CN" } else { "en" },
        ),
    ]);
    let data = response(
        client()?
            .get(url)
            .header("User-Agent", "Fly-Island weather location"),
    )
    .await?;
    let items: Vec<NominatimSearchItem> = serde_json::from_slice(&data)
        .map_err(|error| format!("Invalid city supplement result: {error}"))?;
    for item in items {
        let Ok(latitude) = item.lat.parse::<f64>() else {
            continue;
        };
        let Ok(longitude) = item.lon.parse::<f64>() else {
            continue;
        };
        if coordinates(latitude, longitude).is_err() {
            continue;
        }
        if let Some(address) = item.address {
            if let Some(city) = address_city(address, latitude, longitude, language) {
                return Ok(Some(city));
            }
        }
        if let Some(name) = clean_name(item.name.as_deref(), language) {
            return Ok(Some(WeatherCity {
                name,
                latitude,
                longitude,
            }));
        }
    }
    Ok(None)
}

#[derive(Deserialize)]
struct IpLocation {
    #[serde(default)]
    success: bool,
    city: Option<String>,
    region: Option<String>,
    country: Option<String>,
    latitude: f64,
    longitude: f64,
}

async fn ip_weather_location(language: &str) -> Result<WeatherCity, String> {
    // ipwho.is localizes names itself, so the city needs no second (slow) reverse-geocoding request.
    let url = if language == "zh" {
        "https://ipwho.is/?lang=zh-CN"
    } else {
        "https://ipwho.is/"
    };
    let data = response(
        client()?
            .get(url)
            .header("User-Agent", "Fly-Island weather location"),
    )
    .await?;
    let result: IpLocation = serde_json::from_slice(&data)
        .map_err(|error| format!("Invalid network location result: {error}"))?;
    if !result.success {
        return Err("The network location service did not return a location.".into());
    }
    coordinates(result.latitude, result.longitude)?;
    if let Some(location) = ip_city(&result, language) {
        return Ok(location);
    }
    reverse_geocode(result.latitude, result.longitude, language)
        .await?
        .ok_or_else(|| "The network location service returned no city.".into())
}

fn ip_city(result: &IpLocation, language: &str) -> Option<WeatherCity> {
    let mut parts = vec![clean_name(result.city.as_deref(), language)?];
    for part in [result.region.as_deref(), result.country.as_deref()] {
        if let Some(part) = clean_name(part, language) {
            if !parts.iter().any(|known| name_key(known) == name_key(&part)) {
                parts.push(part);
            }
        }
    }
    Some(WeatherCity {
        name: parts.join(" · "),
        latitude: result.latitude,
        longitude: result.longitude,
    })
}

struct RankedCity {
    city: WeatherCity,
    name_key: String,
    feature_rank: u8,
    population: u64,
}

fn clean_name(value: Option<&str>, language: &str) -> Option<String> {
    let value = value?.trim();
    if value.is_empty() {
        return None;
    }
    let mut variants = value
        .split(" or ")
        .map(str::trim)
        .filter(|part| !part.is_empty());
    let first = variants.next()?;
    let selected = if language == "zh" {
        crate::win32::chinese::to_simplified(first).unwrap_or_else(|| first.to_string())
    } else {
        first.to_string()
    };
    (!selected.is_empty()).then_some(selected)
}

fn name_key(value: &str) -> String {
    value
        .chars()
        .filter(|character| !character.is_whitespace() && !matches!(character, '·' | ',' | '，'))
        .flat_map(char::to_lowercase)
        .collect()
}

fn city_name_key(value: &str) -> String {
    name_key(value.split('·').next().unwrap_or(value).trim())
}

fn place_key(value: &str) -> String {
    let mut key = name_key(value);
    for suffix in ["自治区", "自治州", "地区", "省", "市", "州", "县", "区"] {
        if key.ends_with(suffix) && key.len() > suffix.len() {
            key.truncate(key.len() - suffix.len());
            break;
        }
    }
    key
}

fn feature_rank(feature_code: Option<&str>) -> u8 {
    let code = feature_code.unwrap_or_default();
    if code == "PPLC" {
        return 100;
    }
    if let Some(level) = code.strip_prefix("PPLA").and_then(|suffix| {
        if suffix.is_empty() {
            Some(0)
        } else {
            suffix.parse::<u8>().ok()
        }
    }) {
        return if level == 0 {
            90
        } else {
            96_u8.saturating_sub(level).max(90)
        };
    }
    if code.starts_with("PPL") {
        return 50;
    }
    0
}

fn nearby(first: &RankedCity, second: &RankedCity) -> bool {
    if first.name_key != second.name_key {
        return false;
    }
    let latitude = (first.city.latitude - second.city.latitude).to_radians();
    let longitude = (first.city.longitude - second.city.longitude).to_radians();
    let first_latitude = first.city.latitude.to_radians();
    let second_latitude = second.city.latitude.to_radians();
    let haversine = (latitude / 2.0).sin().powi(2)
        + first_latitude.cos() * second_latitude.cos() * (longitude / 2.0).sin().powi(2);
    let distance_km = 6_371.0 * 2.0 * haversine.sqrt().asin();
    distance_km <= 25.0
}

fn display_name(city: &City, language: &str) -> Option<(String, String)> {
    let city_name = clean_name(Some(&city.name), language)?;
    let key = name_key(&city_name);
    let mut parts = vec![city_name];
    let add = |parts: &mut Vec<String>, value: Option<&str>| {
        let Some(value) = clean_name(value, language) else {
            return false;
        };
        let value_key = place_key(&value);
        if !value_key.is_empty() && !parts.iter().any(|part| place_key(part) == value_key) {
            parts.push(value);
            true
        } else {
            false
        }
    };
    for admin in [
        city.admin1.as_deref(),
        city.admin2.as_deref(),
        city.admin3.as_deref(),
        city.admin4.as_deref(),
    ] {
        if add(&mut parts, admin) {
            break;
        }
    }
    if let Some(country) = clean_name(city.country.as_deref(), language) {
        let country_key = name_key(&country);
        if !parts.iter().any(|part| name_key(part) == country_key) {
            parts.push(country);
        }
    }
    Some((parts.join(" · "), key))
}

fn cities(data: &[u8], query: &str, language: &str) -> Result<Vec<WeatherCity>, String> {
    let result: Geocoding =
        serde_json::from_slice(data).map_err(|error| format!("Invalid city result: {error}"))?;
    let query_key = clean_name(Some(query), language)
        .map(|value| name_key(&value))
        .unwrap_or_else(|| name_key(query));
    let mut ranked = result
        .results
        .into_iter()
        .filter_map(|city| {
            coordinates(city.latitude, city.longitude).ok()?;
            let rank = feature_rank(city.feature_code.as_deref());
            if rank == 0 {
                return None;
            }
            let (name, display_key) = display_name(&city, language)?;
            let raw_name_key = clean_name(Some(&city.name), language)
                .map(|value| name_key(&value))
                .unwrap_or_else(|| name_key(&city.name));
            // 拼音 / 英文查询由接口按别名匹配，返回的中文名里不含查询串，不能按名称过滤。
            if !query_key.is_empty()
                && !query_key.is_ascii()
                && !raw_name_key.contains(&query_key)
                && !query_key.contains(&raw_name_key)
            {
                return None;
            }
            Some(RankedCity {
                city: WeatherCity {
                    name,
                    latitude: city.latitude,
                    longitude: city.longitude,
                },
                name_key: display_key,
                feature_rank: rank,
                population: city.population.unwrap_or(0),
            })
        })
        .collect::<Vec<_>>();
    let max_population = ranked.iter().map(|city| city.population).max().unwrap_or(0);
    let has_administrative_city = ranked.iter().any(|city| city.feature_rank >= 90);
    ranked.retain(|city| {
        city.feature_rank >= 90
            || !has_administrative_city
            || city.population >= max_population.saturating_div(50)
    });
    ranked.sort_by(|first, second| {
        second
            .feature_rank
            .cmp(&first.feature_rank)
            .then_with(|| second.population.cmp(&first.population))
            .then_with(|| first.city.name.cmp(&second.city.name))
    });
    let mut unique = Vec::with_capacity(ranked.len());
    for city in ranked {
        if unique.iter().any(|existing| nearby(existing, &city)) {
            continue;
        }
        unique.push(city);
        if unique.len() == 8 {
            break;
        }
    }
    Ok(unique.into_iter().map(|city| city.city).collect())
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
    let name = aliases::expand(&name);
    let name = name.as_str();
    let language = if language == "zh" { "zh" } else { "en" };
    let start = std::time::Instant::now();
    let result = search_cities(name, language).await;
    diagnostics::search(start, name.chars().count(), language, &result);
    result
}

async fn search_cities(name: &str, language: &str) -> Result<Vec<WeatherCity>, String> {
    if !(2..=100).contains(&name.chars().count()) {
        return Err("Enter a city name (2–100 characters).".into());
    }
    let mut url = reqwest::Url::parse("https://geocoding-api.open-meteo.com/v1/search")
        .map_err(|error| error.to_string())?;
    url.query_pairs_mut().extend_pairs([
        ("name", name),
        ("language", language),
        ("count", "30"),
        ("format", "json"),
    ]);
    let data = response(client()?.get(url)).await?;
    let supplement = needs_search_supplement(&data);
    let mut cities = cities(&data, name, language)?;
    if supplement {
        if let Ok(Some(city)) = supplement_city_search(name, language).await {
            if !cities.iter().any(|existing| {
                city_name_key(&existing.name) == city_name_key(&city.name)
                    && (existing.latitude - city.latitude).abs() < 0.25
                    && (existing.longitude - city.longitude).abs() < 0.25
            }) {
                cities.insert(0, city);
            }
        }
    }
    cities.truncate(8);
    Ok(cities)
}

#[tauri::command]
pub async fn locate_weather(app: AppHandle, language: String) -> Result<LocatedWeather, String> {
    let language = if language == "zh" { "zh" } else { "en" };
    let start = std::time::Instant::now();
    let result = locate(&app, language, start).await;
    diagnostics::locate(start, &result);
    result
}

const WINDOWS_LOCATION_BUDGET: Duration = Duration::from_secs(4);

async fn locate(app: &AppHandle, language: &'static str, start: std::time::Instant) -> Result<LocatedWeather, String> {
    // Ask the network in parallel: when Windows location is off or slow, its answer is already here.
    let network = tauri::async_runtime::spawn(ip_weather_location(language));
    // Windows 定位只给 4 秒，超时直接用网络结果，避免关闭定位或系统卡住时长时间转圈。
    let windows = tokio::time::timeout(WINDOWS_LOCATION_BUDGET, async {
        let (latitude, longitude) = windows_coordinates(app).await?;
        reverse_geocode(latitude, longitude, language).await
    })
    .await;
    match windows {
        Ok(Ok(Some(location))) => {
            network.abort();
            return Ok(LocatedWeather { location, source: "windows".into() });
        }
        Ok(Ok(None)) => diagnostics::fallback(start, None),
        Ok(Err(error)) => diagnostics::fallback(start, Some(&error)),
        Err(_) => diagnostics::fallback(start, Some("Windows location timed out.")),
    }
    let network = network
        .await
        .map_err(|error| format!("Network location task failed: {error}"))?;
    let location = network.map_err(|error| {
        format!(
            "Unable to determine your location. Turn on Windows location in Settings and try again. {error}"
        )
    })?;
    Ok(LocatedWeather {
        location,
        source: "ip".into(),
    })
}

#[tauri::command]
pub async fn get_current_weather(latitude: f64, longitude: f64) -> Result<CurrentWeather, String> {
    let start = std::time::Instant::now();
    let result = current_weather(latitude, longitude).await;
    diagnostics::forecast(start, latitude, longitude, &result);
    result
}

async fn current_weather(latitude: f64, longitude: f64) -> Result<CurrentWeather, String> {
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
        $next!([$($done)* crate::weather::search_weather_cities, crate::weather::locate_weather, crate::weather::get_current_weather,] $($rest)*)
    };
}
pub(crate) use tauri_commands;

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn network_location_uses_localized_names_without_repeats() {
        let ip = |city: Option<&str>| IpLocation {
            success: true,
            city: city.map(str::to_string),
            region: Some("广东省".into()),
            country: Some("中国".into()),
            latitude: 22.54,
            longitude: 114.06,
        };
        let city = ip_city(&ip(Some("深圳市")), "zh").expect("city");
        assert_eq!(city.name, "深圳市 · 广东省 · 中国");
        assert!(ip_city(&ip(None), "zh").is_none());
    }
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
        assert!(cities(b"{}", "Beijing", "en").unwrap().is_empty());
        let list = cities(r#"{"results":[{"name":"Beijing","latitude":39.9,"longitude":116.4,"feature_code":"PPLC","population":18960744,"admin1":"Beijing","admin2":"Beijing","country":"China"},{"name":"invalid","latitude":999,"longitude":0}]}"#.as_bytes(), "Beijing", "en").unwrap();
        assert_eq!(list.len(), 1);
        assert_eq!(list[0].name, "Beijing · China");
        assert!(cities(b"not json", "Beijing", "en").is_err());
    }
    #[test]
    fn pinyin_query_keeps_chinese_named_results() {
        let data = r#"{"results":[{"name":"北京","latitude":39.9,"longitude":116.4,"feature_code":"PPLC","population":18960744,"admin1":"北京","country":"中国"}]}"#;
        let list = cities(data.as_bytes(), "beijing", "zh").unwrap();
        assert_eq!(list.len(), 1);
        assert!(list[0].name.starts_with("北京"));
    }
    #[test]
    fn same_name_places_stay_distinguishable() {
        let data = r#"{"results":[
            {"name":"朝阳","latitude":39.92,"longitude":116.44,"feature_code":"PPLA2","population":3500000,"admin1":"北京","country":"中国"},
            {"name":"朝阳","latitude":41.57,"longitude":120.45,"feature_code":"PPLA2","population":3000000,"admin1":"辽宁","country":"中国"}
        ]}"#;
        let list = cities(data.as_bytes(), "朝阳", "zh").unwrap();
        assert_eq!(list.len(), 2);
        assert_ne!(list[0].name, list[1].name);
    }
    #[test]
    fn ranks_and_filters_real_shenzhen_duplicates() {
        let list = cities(r#"{"results":[
            {"name":"深圳","latitude":22.54554,"longitude":114.0683,"feature_code":"PPLA2","population":17494398,"admin1":"广东","admin2":"深圳","country":"中国"},
            {"name":"深圳","latitude":24.95694,"longitude":121.01222,"feature_code":"PPL","population":6700,"admin1":"臺灣省 or 台灣省","admin2":"桃園市","country":"台湾"},
            {"name":"深圳","latitude":24.79594,"longitude":118.43899,"feature_code":"PPL","admin1":"福建省","admin2":"泉州市","country":"中国"},
            {"name":"深圳","latitude":22.54560,"longitude":114.06835,"feature_code":"PPLA2","population":1000,"admin1":"广东","country":"中国"},
            {"name":"深圳宝安国际机场","latitude":22.63926,"longitude":113.81066,"feature_code":"AIRP","population":0,"admin1":"广东","country":"中国"}
        ]}"#.as_bytes(), "深圳", "zh").unwrap();
        assert_eq!(list.len(), 1);
        assert_eq!(list[0].name, "深圳 · 广东 · 中国");
    }
    #[test]
    fn keeps_small_place_results_when_no_city_level_match_exists() {
        let list = cities(r#"{"results":[
            {"name":"Littleville","latitude":10.0,"longitude":10.0,"feature_code":"PPL","population":1200,"country":"Example"},
            {"name":"Littleville","latitude":20.0,"longitude":20.0,"feature_code":"PPL","population":0,"country":"Example"}
        ]}"#.as_bytes(), "Littleville", "en").unwrap();
        assert_eq!(list.len(), 2);
    }
    #[test]
    fn cleans_variant_names_and_deduplicates_admin_parts() {
        let list = cities(r#"{"results":[{"name":"北京","latitude":39.9,"longitude":116.4,"feature_code":"PPLC","population":100,"admin1":"北京市","admin2":"北京市","country":"中国"}]}"#.as_bytes(), "北京", "zh").unwrap();
        assert_eq!(list[0].name, "北京 · 中国");
        let list = cities(r#"{"results":[{"name":"深圳","latitude":24.95694,"longitude":121.01222,"feature_code":"PPL","population":6700,"admin1":"臺灣省 or 台灣省","country":"台湾"}]}"#.as_bytes(), "深圳", "zh").unwrap();
        assert_eq!(list[0].name, "深圳 · 台湾省 · 台湾");
        let list = cities(r#"{"results":[{"name":"臺北","latitude":25.03,"longitude":121.56,"feature_code":"PPLC","population":2500000,"admin1":"臺北市","country":"臺灣"}]}"#.as_bytes(), "台北", "zh").unwrap();
        assert_eq!(list[0].name, "台北 · 台湾");
        assert_eq!(city_name_key("长沙 · 重庆 · 中国"), city_name_key("长沙 · 湖南省 · 中国"));
    }
    #[test]
    fn supplements_low_quality_geocoding_results() {
        assert!(needs_search_supplement(
            r#"{"results":[{"name":"长沙","latitude":30.9,"longitude":108.3,"feature_code":"PPLA4","population":47170}]}"#
                .as_bytes()
        ));
        assert!(!needs_search_supplement(
            r#"{"results":[{"name":"深圳","latitude":22.5,"longitude":114.0,"feature_code":"PPLA2","population":17494398}]}"#
                .as_bytes()
        ));
    }
    #[test]
    fn ranks_all_administrative_city_levels_above_generic_places() {
        assert!(feature_rank(Some("PPLA1")) > feature_rank(Some("PPLA6")));
        assert!(feature_rank(Some("PPLA6")) > feature_rank(Some("PPL")));
        assert_eq!(feature_rank(Some("PPLA")), 90);
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
