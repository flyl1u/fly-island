use std::time::Instant;

use crate::app_log::{event, Category};

use super::{CurrentWeather, LocatedWeather, WeatherCity};

fn failure(error: &str) -> &'static str {
    if error.starts_with("Enter a city name") {
        "invalid_query"
    } else if error.starts_with("Invalid weather coordinates") {
        "invalid_coordinates"
    } else if error.contains("permission was denied") {
        "permission_denied"
    } else if error.contains("timed out") {
        "timeout"
    } else if error.starts_with("Weather service unavailable") {
        "http_error"
    } else if error.starts_with("Weather request failed") {
        "network_error"
    } else if error.starts_with("Could not read weather") {
        "response_read_error"
    } else if error.starts_with("Weather response is too large") {
        "response_too_large"
    } else if error.starts_with("Invalid ") {
        "invalid_response"
    } else {
        "unavailable"
    }
}

pub(super) fn search(
    start: Instant,
    query_chars: usize,
    language: &str,
    result: &Result<Vec<WeatherCity>, String>,
) {
    let (reason, count) = match result {
        Ok(cities) if cities.is_empty() => ("no_results", 0),
        Ok(cities) => ("success", cities.len()),
        Err(error) => (failure(error), 0),
    };
    event(
        Category::Weather,
        "city_search",
        &[
            ("reason", reason),
            ("query_chars", &query_chars.to_string()),
            ("language", language),
            ("count", &count.to_string()),
            ("elapsed_ms", &start.elapsed().as_millis().to_string()),
        ],
    );
}

pub(super) fn fallback(start: Instant, error: Option<&str>) {
    let reason = error.map_or("windows_city_unresolved", failure);
    event(
        Category::Weather,
        "locate_fallback",
        &[
            ("reason", reason),
            ("source", "ip"),
            ("elapsed_ms", &start.elapsed().as_millis().to_string()),
        ],
    );
}

pub(super) fn locate(start: Instant, result: &Result<LocatedWeather, String>) {
    let elapsed = start.elapsed().as_millis().to_string();
    match result {
        Ok(found) => event(
            Category::Weather,
            "locate",
            &[
                ("reason", "success"),
                ("source", &found.source),
                ("elapsed_ms", &elapsed),
                ("city", &found.location.name),
                ("latitude", &found.location.latitude.to_string()),
                ("longitude", &found.location.longitude.to_string()),
            ],
        ),
        Err(error) => event(
            Category::Weather,
            "locate",
            &[
                ("reason", failure(error)),
                ("source", "ip"),
                ("elapsed_ms", &elapsed),
            ],
        ),
    }
}

pub(super) fn forecast(
    start: Instant,
    latitude: f64,
    longitude: f64,
    result: &Result<CurrentWeather, String>,
) {
    event(
        Category::Weather,
        "forecast",
        &[
            (
                "reason",
                result
                    .as_ref()
                    .map_or_else(|error| failure(error), |_| "success"),
            ),
            ("latitude", &latitude.to_string()),
            ("longitude", &longitude.to_string()),
            ("elapsed_ms", &start.elapsed().as_millis().to_string()),
        ],
    );
}

#[cfg(test)]
mod tests {
    use super::failure;

    #[test]
    fn categorizes_errors_without_returning_request_details() {
        assert_eq!(
            failure("Weather request failed: https://example.test/?latitude=12.9876"),
            "network_error"
        );
        assert_eq!(
            failure("Windows location is disabled or permission was denied."),
            "permission_denied"
        );
        assert_eq!(
            failure("Weather service unavailable: HTTP 503"),
            "http_error"
        );
        assert_eq!(failure("private text"), "unavailable");
    }
}
