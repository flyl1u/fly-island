//! Kimi Code's plan usage: the 5-hour and weekly windows from `api.kimi.com/coding/v1/usages`,
//! asked with the login Kimi Code CLI keeps (`~/.kimi/credentials/kimi-code.json`). Read the same
//! way as xiaotang-daozai's quota adapter (MIT, see docs/third-party-licenses.md). The answer is
//! kept for five minutes: the Agent page asks every 30 seconds.

use std::{fs, path::Path, sync::Mutex, time::{Duration, Instant}};

use reqwest::{header, redirect::Policy, StatusCode};
use serde_json::Value;

use super::{sessions::parse_timestamp_ms, snapshot::current_unix_millis, usage::{AgentUsage, UsageSource, UsageWindow}};

const USAGE_URL: &str = "https://api.kimi.com/coding/v1/usages";
const KEEP_FOR: Duration = Duration::from_secs(5 * 60);
static LAST: Mutex<Option<(Instant, String, Option<AgentUsage>)>> = Mutex::new(None);

fn token(home: &Path) -> Option<String> {
    [".kimi/credentials/kimi-code.json", ".kimi-code/credentials/kimi-code.json"].iter().find_map(|path| {
        let raw = fs::read(home.join(path)).ok()?;
        let value: Value = serde_json::from_slice(raw.strip_prefix(b"\xef\xbb\xbf").unwrap_or(&raw)).ok()?;
        value["access_token"].as_str().map(str::trim).filter(|s| !s.is_empty()).map(str::to_string)
    })
}

/// Numbers arrive as numbers or as strings.
fn number(value: &Value) -> Option<f64> {
    value.as_f64().or_else(|| value.as_str()?.trim().parse().ok())
}

pub(super) fn reset_at(value: &Value) -> Option<i64> {
    match value {
        Value::String(text) => parse_timestamp_ms(text).or_else(|| number(value).map(|n| n as i64)),
        Value::Number(_) => number(value).map(|n| if n > 1e12 { n as i64 } else { (n * 1000.0) as i64 }),
        _ => None,
    }
}

/// Fills the window `seconds` long: five hours and a week have their own places, any other is
/// listed by its length ("30d", "1d", "3h").
pub(super) fn place(usage: &mut AgentUsage, seconds: Option<i64>, window: UsageWindow) {
    match seconds {
        Some(18_000) if usage.five_hour.is_none() => usage.five_hour = Some(window),
        Some(604_800) if usage.seven_day.is_none() => usage.seven_day = Some(window),
        _ => {
            let name = match seconds {
                Some(s) if s >= 86_400 => format!("{}d", s / 86_400),
                Some(s) => format!("{}h", (s / 3_600).max(1)),
                None => "30d".to_string(),
            };
            if !usage.models.iter().any(|known| known.name == name) {
                usage.models.push(UsageWindow { name, ..window });
            }
        }
    }
}

fn parse(value: &Value, now: i64) -> Option<AgentUsage> {
    let mut usage = AgentUsage { updated_at: Some(now), five_hour: None, seven_day: None, models: Vec::new(), plan: None, source: UsageSource::Kimi };
    if let Some(usages) = value["usages"].as_object() {
        for (key, seconds) in [("limit_5h", Some(18_000)), ("limit_7d", Some(604_800)), ("limit_month_total", None)] {
            let Some(entry) = usages.get(key) else { continue };
            let Some(used) = number(&entry["used_ratio"]).filter(|n| (0.0..=1.0).contains(n)) else { continue };
            place(&mut usage, seconds, UsageWindow { name: String::new(), used: used * 100.0, resets_at: reset_at(&entry["reset_time"]) });
        }
    }
    let section = |entry: &Value| {
        let limit = number(&entry["limit"]).filter(|limit| *limit > 0.0)?;
        let remaining = number(&entry["remaining"]).or_else(|| Some(limit - number(&entry["used"])?))?;
        Some(UsageWindow { name: String::new(), used: (100.0 - remaining / limit * 100.0).clamp(0.0, 100.0), resets_at: reset_at(&entry["resetTime"]) })
    };
    for limit in value["limits"].as_array().into_iter().flatten() {
        let factor = match limit["window"]["timeUnit"].as_str() {
            Some("TIME_UNIT_SECOND") => Some(1), Some("TIME_UNIT_MINUTE") => Some(60),
            Some("TIME_UNIT_HOUR") => Some(3_600), Some("TIME_UNIT_DAY") => Some(86_400), _ => None,
        };
        let seconds = limit["window"]["duration"].as_i64().zip(factor).and_then(|(d, f)| d.checked_mul(f));
        if let Some(window) = section(&limit["detail"]) { place(&mut usage, seconds, window); }
    }
    if let Some(window) = section(&value["usage"]) { place(&mut usage, Some(604_800), window); }
    (usage.five_hour.is_some() || usage.seven_day.is_some() || !usage.models.is_empty()).then_some(usage)
}

async fn fetch(token: &str) -> Result<Option<AgentUsage>, String> {
    let client = reqwest::Client::builder().connect_timeout(Duration::from_secs(4)).timeout(Duration::from_secs(8))
        .redirect(Policy::none()).build().map_err(|_| "无法创建网络请求".to_string())?;
    let mut auth = header::HeaderValue::from_str(&format!("Bearer {token}")).map_err(|_| "Kimi Code 的登录凭据无效".to_string())?;
    auth.set_sensitive(true);
    let response = client.get(USAGE_URL).header(header::AUTHORIZATION, auth).header(header::ACCEPT, "application/json")
        .send().await.map_err(|_| "无法连接 Kimi 额度服务".to_string())?;
    match response.status() {
        StatusCode::OK => {}
        StatusCode::UNAUTHORIZED | StatusCode::FORBIDDEN => return Err("Kimi Code 登录已失效，请在 Kimi Code 中重新登录".to_string()),
        status => return Err(format!("Kimi 额度服务暂不可用（{}）", status.as_u16())),
    }
    let bytes = response.bytes().await.map_err(|_| "读取 Kimi 额度失败".to_string())?;
    if bytes.len() > 1024 * 1024 { return Err("Kimi 额度响应过大".to_string()); }
    let value: Value = serde_json::from_slice(&bytes).map_err(|_| "Kimi 额度响应无效".to_string())?;
    Ok(parse(&value, current_unix_millis()))
}

/// Kimi Code's usage windows; null when it is not signed in or the plan has no windows.
#[tauri::command]
pub async fn get_kimi_usage() -> Result<Option<AgentUsage>, String> {
    let Some(token) = crate::system::windows_home_dir().ok().and_then(|home| token(&home)) else { return Ok(None) };
    let kept = LAST.lock().ok().and_then(|last| {
        last.as_ref().filter(|(at, known, _)| at.elapsed() < KEEP_FOR && *known == token).map(|(_, _, usage)| usage.clone())
    });
    if let Some(usage) = kept {
        return Ok(usage);
    }
    let usage = fetch(&token).await?;
    if let Ok(mut last) = LAST.lock() { *last = Some((Instant::now(), token, usage.clone())); }
    Ok(usage)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn reads_the_current_usages_shape() {
        let usage = parse(&json!({"usages": {"limit_5h": {"used_ratio": "0.25", "reset_time": "2030-01-01T00:00:00Z"}, "limit_7d": {"used_ratio": 0.5}}}), 1).unwrap();
        assert_eq!(usage.five_hour.as_ref().map(|w| w.used), Some(25.0));
        assert!(usage.five_hour.unwrap().resets_at.is_some());
        assert_eq!(usage.seven_day.map(|w| w.used), Some(50.0));
    }

    #[test]
    fn reads_the_older_limits_shape() {
        let usage = parse(&json!({"usage": {"limit": "100", "remaining": "70"}, "limits": [{"window": {"duration": 300, "timeUnit": "TIME_UNIT_MINUTE"}, "detail": {"limit": "20", "used": "5"}}]}), 1).unwrap();
        assert_eq!(usage.five_hour.map(|w| w.used), Some(25.0));
        assert_eq!(usage.seven_day.map(|w| w.used.round()), Some(30.0));
        assert!(parse(&json!({}), 1).is_none());
    }
}
