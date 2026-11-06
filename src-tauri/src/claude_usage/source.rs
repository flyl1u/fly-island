//! Where the usage numbers come from: Claude Code's OAuth usage endpoint, read
//! with the access token Claude Code saved, through a proxy (never direct).
//! The credentials file is only read: the token is never refreshed here and the
//! file is never written, so Claude Code stays the only owner of the login.

use super::{UsageErrorKind, UsageWindow};
use serde::Deserialize;
use serde_json::Value;
use std::{
    path::PathBuf,
    time::{Duration, SystemTime, UNIX_EPOCH},
};

const USAGE_URL: &str = "https://api.anthropic.com/api/oauth/usage";
const OAUTH_BETA: &str = "oauth-2025-04-20";
const REQUEST_TIMEOUT: Duration = Duration::from_secs(20);
/// A bad Retry-After must not stop the ring for hours.
const MAX_RETRY_AFTER: Duration = Duration::from_secs(60 * 60);

/// The two windows the ring shows; either can be missing from an answer.
#[derive(Debug, Default, PartialEq)]
pub(super) struct Limits {
    pub five_hour: Option<UsageWindow>,
    pub seven_day: Option<UsageWindow>,
}

#[derive(Debug, PartialEq)]
pub(super) struct FetchError {
    pub kind: UsageErrorKind,
    pub message: String,
    /// From a 429's Retry-After.
    pub retry_after: Option<Duration>,
}

impl FetchError {
    fn new(kind: UsageErrorKind, message: impl Into<String>) -> Self {
        Self {
            kind,
            message: message.into(),
            retry_after: None,
        }
    }
}

/// Only the fields needed; the refresh token is not even kept in memory.
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct OAuthCredentials {
    access_token: Option<String>,
    expires_at: Option<f64>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct CredentialsFile {
    claude_ai_oauth: Option<OAuthCredentials>,
}

/// `%CLAUDE_CONFIG_DIR%\.credentials.json`, else `%USERPROFILE%\.claude\.credentials.json`.
fn credentials_path() -> Option<PathBuf> {
    let non_empty = |key: &str| std::env::var_os(key).filter(|value| !value.is_empty());
    let dir = non_empty("CLAUDE_CONFIG_DIR")
        .map(PathBuf::from)
        .or_else(|| {
            non_empty("USERPROFILE")
                .or_else(|| non_empty("HOME"))
                .map(|home| PathBuf::from(home).join(".claude"))
        })?;
    Some(dir.join(".credentials.json"))
}

pub(super) fn parse_access_token(text: &str, now_ms: u64) -> Result<String, FetchError> {
    let missing = || {
        FetchError::new(
            UsageErrorKind::NoCredentials,
            "Claude Code has no saved login (claudeAiOauth.accessToken).",
        )
    };
    let file: CredentialsFile = serde_json::from_str(text).map_err(|_| missing())?;
    let oauth = file.claude_ai_oauth.ok_or_else(missing)?;
    let token = oauth
        .access_token
        .filter(|token| !token.trim().is_empty())
        .ok_or_else(missing)?;
    // Claude Code renews the token while it runs; an expired one would only earn a 401.
    if oauth
        .expires_at
        .is_some_and(|expires| expires < now_ms as f64)
    {
        return Err(FetchError::new(
            UsageErrorKind::TokenExpired,
            "The Claude Code login has expired; Claude Code renews it when it runs.",
        ));
    }
    Ok(token)
}

/// The proxy to ask through: the setting, else HTTPS_PROXY, else the Windows
/// proxy (what Clash and similar tools switch on as the "system proxy"); None
/// when there is none, as the request never goes direct.
pub(super) fn resolve_proxy(configured: Option<&str>) -> Option<String> {
    let env = ["HTTPS_PROXY", "https_proxy"]
        .iter()
        .find_map(|key| std::env::var(key).ok());
    pick_proxy(configured, env.as_deref(), windows_proxy().as_deref())
}

pub(super) fn pick_proxy(configured: Option<&str>, env: Option<&str>, system: Option<&str>) -> Option<String> {
    [configured, env, system]
        .into_iter()
        .flatten()
        .map(str::trim)
        .find(|proxy| !proxy.is_empty())
        .map(str::to_string)
}

const INTERNET_SETTINGS: &str = r"Software\Microsoft\Windows\CurrentVersion\Internet Settings";

/// The current user's Windows proxy when it is switched on.
fn windows_proxy() -> Option<String> {
    use windows::Win32::System::Registry::HKEY_CURRENT_USER;
    let enabled = crate::win32::registry::read_u32(HKEY_CURRENT_USER, INTERNET_SETTINGS, "ProxyEnable")?;
    let server = crate::win32::registry::read_string(HKEY_CURRENT_USER, INTERNET_SETTINGS, "ProxyServer")?;
    (enabled != 0).then(|| https_entry(&server)).flatten()
}

/// The proxy for https from a `ProxyServer` value: `host:port` for every
/// scheme, or `http=a:1;https=b:2;socks=c:3`, where `https=` wins over `http=`.
pub(super) fn https_entry(server: &str) -> Option<String> {
    let server = server.trim();
    if !server.contains('=') {
        return (!server.is_empty()).then(|| server.to_string());
    }
    let entry = |scheme: &str| {
        server.split(';').find_map(|part| {
            let (key, value) = part.split_once('=')?;
            (key.trim().eq_ignore_ascii_case(scheme) && !value.trim().is_empty()).then(|| value.trim().to_string())
        })
    };
    entry("https").or_else(|| entry("http"))
}

/// Only http(s) proxies: reqwest's proxy matcher skips other schemes and would
/// then send the token straight to api.anthropic.com. `host:port` means http.
pub(super) fn proxy_url(raw: &str) -> Result<reqwest::Url, FetchError> {
    let with_scheme = if raw.contains("://") {
        raw.to_string()
    } else {
        format!("http://{raw}")
    };
    reqwest::Url::parse(&with_scheme)
        .ok()
        .filter(|url| matches!(url.scheme(), "http" | "https") && url.host_str().is_some())
        .ok_or_else(|| {
            FetchError::new(
                UsageErrorKind::Network,
                "The proxy must be an http:// or https:// address.",
            )
        })
}

/// `scheme://host:port`, without any `user:pass@`, for error messages.
pub(super) fn proxy_label(url: &reqwest::Url) -> String {
    let host = url.host_str().unwrap_or_default();
    match url.port_or_known_default() {
        Some(port) => format!("{}://{host}:{port}", url.scheme()),
        None => format!("{}://{host}", url.scheme()),
    }
}

fn request_error(error: reqwest::Error, proxy: &str) -> String {
    let what = if error.is_timeout() {
        "timed out"
    } else if error.is_connect() {
        "could not connect"
    } else {
        "failed"
    };
    format!(
        "The request to api.anthropic.com through {proxy} {what}: {}",
        error.without_url()
    )
}

pub(super) async fn fetch_api(proxy: Option<&str>, now_ms: u64) -> Result<Limits, FetchError> {
    let network = UsageErrorKind::Network;
    let path = credentials_path().ok_or_else(|| {
        FetchError::new(
            UsageErrorKind::NoCredentials,
            "The user profile folder is unknown.",
        )
    })?;
    let text = std::fs::read_to_string(&path).map_err(|error| {
        FetchError::new(
            UsageErrorKind::NoCredentials,
            format!("Could not read {}: {error}", path.display()),
        )
    })?;
    let token = parse_access_token(&text, now_ms)?;
    let proxy = proxy.ok_or_else(|| {
        FetchError::new(
            UsageErrorKind::NoProxy,
            "No proxy: set one in the plugin, HTTPS_PROXY or the Windows proxy settings.",
        )
    })?;
    let proxy = proxy_url(proxy)?;
    let label = proxy_label(&proxy);
    let proxy_setting = reqwest::Proxy::all(proxy)
        .map_err(|error| FetchError::new(network, format!("Invalid proxy {label}: {error}")))?;
    let client = reqwest::Client::builder()
        .timeout(REQUEST_TIMEOUT)
        .proxy(proxy_setting)
        // A redirect could lead the token somewhere else.
        .redirect(reqwest::redirect::Policy::none())
        .user_agent(concat!("FocuSD-Island/", env!("CARGO_PKG_VERSION")))
        .build()
        .map_err(|error| {
            FetchError::new(
                network,
                format!("Could not create the HTTP client: {error}"),
            )
        })?;
    let response = client
        .get(USAGE_URL)
        .bearer_auth(token)
        .header("anthropic-beta", OAUTH_BETA)
        .send()
        .await
        .map_err(|error| FetchError::new(network, request_error(error, &label)))?;
    let status = response.status().as_u16();
    let retry_after = response
        .headers()
        .get(reqwest::header::RETRY_AFTER)
        .and_then(|value| value.to_str().ok())
        .map(str::to_string);
    if let Some(error) = status_error(status, retry_after.as_deref()) {
        return Err(error);
    }
    let body = response
        .text()
        .await
        .map_err(|error| FetchError::new(network, request_error(error, &label)))?;
    parse_api_usage(&body)
}

pub(super) fn status_error(status: u16, retry_after: Option<&str>) -> Option<FetchError> {
    match status {
        200..=299 => None,
        401 => Some(FetchError::new(
            UsageErrorKind::LoginRequired,
            "api.anthropic.com refused the login (HTTP 401).",
        )),
        // Can be a token without the usage scope, which signing in again may not fix.
        403 => Some(FetchError::new(
            UsageErrorKind::Forbidden,
            "api.anthropic.com refused to show the usage (HTTP 403).",
        )),
        429 => Some(FetchError {
            retry_after: retry_after.and_then(parse_retry_after),
            ..FetchError::new(
                UsageErrorKind::RateLimited,
                "api.anthropic.com asked to slow down (HTTP 429).",
            )
        }),
        _ => Some(FetchError::new(
            UsageErrorKind::Http,
            format!("api.anthropic.com answered HTTP {status}."),
        )),
    }
}

/// shortcut: only the delta-seconds form; an HTTP-date falls back to the backoff, parse it if the API starts sending one.
pub(super) fn parse_retry_after(value: &str) -> Option<Duration> {
    value
        .trim()
        .parse::<u64>()
        .ok()
        .map(|seconds| Duration::from_secs(seconds).min(MAX_RETRY_AFTER))
}

/// A window from `{<percent key>: 0–100, resets_at: ISO}`; the first finite key wins.
fn window(value: Option<&Value>, keys: &[&str]) -> Option<UsageWindow> {
    let value = value?;
    let percent = keys.iter().find_map(|key| {
        value
            .get(*key)
            .and_then(Value::as_f64)
            .filter(|percent| percent.is_finite() && *percent >= 0.0)
    })?;
    Some(UsageWindow {
        percent: percent.min(100.0),
        resets_at: value.get("resets_at").and_then(reset_time),
    })
}

/// An ISO 8601 string as given, or Unix seconds / milliseconds turned into one.
fn reset_time(value: &Value) -> Option<String> {
    if let Some(text) = value.as_str() {
        return Some(text.to_string());
    }
    let number = value
        .as_f64()
        .filter(|number| number.is_finite() && *number > 0.0)?;
    let seconds = if number > 1e12 {
        number / 1000.0
    } else {
        number
    } as i64;
    Some(iso_from_unix_seconds(seconds))
}

/// `YYYY-MM-DDTHH:MM:SSZ` (civil-from-days, H. Hinnant), to avoid a date crate for one field.
pub(super) fn iso_from_unix_seconds(seconds: i64) -> String {
    let (days, time) = (seconds.div_euclid(86_400), seconds.rem_euclid(86_400));
    let z = days + 719_468;
    let era = z.div_euclid(146_097);
    let doe = z - era * 146_097;
    let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let day = doy - (153 * mp + 2) / 5 + 1;
    let month = if mp < 10 { mp + 3 } else { mp - 9 };
    let year = yoe + era * 400 + i64::from(month <= 2);
    format!(
        "{year:04}-{month:02}-{day:02}T{:02}:{:02}:{:02}Z",
        time / 3600,
        time % 3600 / 60,
        time % 60
    )
}

/// The `oauth/usage` answer. Newer answers list `limits[]` (`session`, `weekly_all`),
/// which wins over the older `five_hour` / `seven_day` objects.
pub(super) fn parse_api_usage(body: &str) -> Result<Limits, FetchError> {
    let invalid = |message: &str| FetchError::new(UsageErrorKind::InvalidResponse, message);
    let value: Value =
        serde_json::from_str(body).map_err(|_| invalid("The usage answer is not JSON."))?;
    let mut limits = Limits::default();
    for entry in value
        .get("limits")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
    {
        let slot = match entry.get("kind").and_then(Value::as_str) {
            Some("session") => &mut limits.five_hour,
            Some("weekly_all") => &mut limits.seven_day,
            _ => continue,
        };
        if slot.is_none() {
            *slot = window(Some(entry), &["percent", "utilization"]);
        }
    }
    limits.five_hour = limits
        .five_hour
        .or_else(|| window(value.get("five_hour"), &["utilization"]));
    limits.seven_day = limits
        .seven_day
        .or_else(|| window(value.get("seven_day"), &["utilization"]));
    if limits.five_hour.is_none() && limits.seven_day.is_none() {
        return Err(invalid("The usage answer has no 5-hour or 7-day limit."));
    }
    Ok(limits)
}

pub(super) fn unix_ms(time: SystemTime) -> u64 {
    time.duration_since(UNIX_EPOCH)
        .map(|elapsed| elapsed.as_millis() as u64)
        .unwrap_or(0)
}
