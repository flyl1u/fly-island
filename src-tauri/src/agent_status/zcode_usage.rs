//! Z Code's plan usage, preferring a manual Coding Plan API key and falling back to the desktop
//! app's sign-in (zcode_credentials.rs). Desktop accounts without a Coding Plan use trial balances.
//! Endpoints and shapes as in xiaotang-daozai's `zcode_quota.rs` (MIT). Kept for five minutes.

use std::{fs, io::Read, path::{Path, PathBuf}, sync::Mutex, time::{Duration, Instant}};

use reqwest::{header, redirect::Policy, StatusCode, Url};
use ring::digest;
use serde_json::Value;

use super::{kimi_usage::{place, reset_at}, snapshot::current_unix_millis, usage::{AgentUsage, UsageSource, UsageWindow},
    zcode_api_key::{read_config, ApiKeyPlatform}, zcode_credentials::{credentials_path, login, value}};

const KEEP_FOR: Duration = Duration::from_secs(5 * 60);
static LAST: Mutex<Option<(Instant, String, Option<AgentUsage>)>> = Mutex::new(None);

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum AuthKind {
    ApiKey,
    Desktop,
    None,
}

fn auth_kind(api_key: Option<&str>, has_desktop_credentials: bool) -> AuthKind {
    if api_key.is_some_and(|key| !key.trim().is_empty()) {
        AuthKind::ApiKey
    } else if has_desktop_credentials {
        AuthKind::Desktop
    } else {
        AuthKind::None
    }
}

fn read_json(path: &Path) -> Option<Value> {
    let mut raw = Vec::new();
    fs::File::open(path).ok()?.take(1024 * 1024).read_to_end(&mut raw).ok()?;
    serde_json::from_slice(raw.strip_prefix(b"\xef\xbb\xbf").unwrap_or(&raw)).ok()
}

fn number(value: &Value) -> Option<f64> {
    value.as_f64().or_else(|| value.as_str()?.trim().parse().ok())
}

fn integer(value: &Value) -> Option<i64> {
    value.as_i64().or_else(|| value.as_str()?.trim().parse().ok())
}

fn percentage(value: &Value) -> Option<f64> {
    let value = number(value)?;
    if !value.is_finite() { return None; }
    Some(if value > 0.0 && value < 1.0 { value * 100.0 } else { value.clamp(0.0, 100.0) })
}

fn success(value: &Value) -> bool {
    matches!(integer(&value["code"]), Some(0 | 200)) || (value["code"].is_null() && value["success"] == true)
}

fn coding_plan_host(family: &str) -> &'static str {
    if family == "zai" { "https://api.z.ai" } else { "https://open.bigmodel.cn" }
}

fn empty(plan: &str, now: i64) -> AgentUsage {
    AgentUsage { updated_at: Some(now), five_hour: None, seven_day: None, models: Vec::new(), plan: Some(plan.to_string()), source: UsageSource::Zcode }
}

/// `data.limits[]`: `percentage` used of a window `number` × `unit` long (1 day, 3 hour,
/// 5 minute, 6 week). Token windows are the plan; tool-call windows only stand in without them.
fn coding(value: &Value, now: i64) -> Option<AgentUsage> {
    let mut usage = empty("Coding Plan", now);
    let mut tools = Vec::new();
    for row in value["data"]["limits"].as_array().into_iter().flatten() {
        let Some(used) = percentage(&row["percentage"]) else { continue };
        let reset = reset_at(&row["nextResetTime"]).filter(|at| *at > 0);
        let unit = integer(&row["unit"]);
        let seconds = match (row["type"].as_str(), unit) {
            (Some("TOKENS_LIMIT" | "CREDIT_LIMIT"), Some(3)) => Some(18_000),
            (Some("TOKENS_LIMIT" | "CREDIT_LIMIT"), Some(6)) => Some(604_800),
            (Some("TOKENS_LIMIT" | "CREDIT_LIMIT"), None) => Some(if reset.is_some_and(|at| at.saturating_sub(now) > 12 * 60 * 60 * 1000) { 604_800 } else { 18_000 }),
            (_, unit) => integer(&row["number"]).filter(|n| *n > 0).zip(match unit { Some(1) => Some(86_400), Some(3) => Some(3_600), Some(5) => Some(60), Some(6) => Some(604_800), _ => None }).and_then(|(n, m)| n.checked_mul(m)),
        };
        let window = UsageWindow { name: String::new(), used, resets_at: reset };
        match row["type"].as_str() {
            Some("TOKENS_LIMIT" | "CREDIT_LIMIT") => place(&mut usage, seconds, window),
            Some("TIME_LIMIT") => tools.push((seconds, window)),
            _ => {}
        }
    }
    if usage.five_hour.is_none() && usage.seven_day.is_none() && usage.models.is_empty() {
        tools.into_iter().for_each(|(seconds, window)| place(&mut usage, seconds, window));
    }
    (usage.five_hour.is_some() || usage.seven_day.is_some() || !usage.models.is_empty()).then_some(usage)
}

/// `data.balances[]`: trial buckets with `total_units`, `remaining_units`, `expires_at`.
fn start(value: &Value, now: i64) -> Option<AgentUsage> {
    let mut usage = empty("Start Plan", now);
    for bucket in value["data"]["balances"].as_array().into_iter().flatten() {
        let Some(total) = number(&bucket["total_units"]).filter(|n| *n > 0.0) else { continue };
        let Some(left) = number(&bucket["remaining_units"]).filter(|n| *n >= 0.0) else { continue };
        let expires = reset_at(&bucket["expires_at"]);
        if expires.is_some_and(|at| at <= now) { continue; }
        let name = bucket["show_name"].as_str().filter(|s| !s.is_empty()).unwrap_or("Start Plan").to_string();
        usage.models.push(UsageWindow { name, used: (100.0 - left / total * 100.0).clamp(0.0, 100.0), resets_at: expires });
    }
    (!usage.models.is_empty()).then_some(usage)
}

async fn get(client: &reqwest::Client, url: Url, auth: &str, device: Option<&str>, api_key: bool) -> Result<Value, String> {
    let mut auth = header::HeaderValue::from_str(auth).map_err(|_| "Z Code 的登录凭据无效".to_string())?;
    auth.set_sensitive(true);
    let mut request = client.get(url).header(header::AUTHORIZATION, auth).header(header::ACCEPT, "application/json");
    if api_key { request = request.header(header::ACCEPT_LANGUAGE, "zh-CN,zh"); }
    if let Some(device) = device { request = request.header("X-Device-Mid", device); }
    let response = request.send().await.map_err(|_| if api_key { "zcode_usage:network".to_string() } else { "无法连接 Z Code 用量服务".to_string() })?;
    match response.status() {
        StatusCode::OK => {}
        StatusCode::UNAUTHORIZED | StatusCode::FORBIDDEN => return Err(if api_key { "zcode_usage:auth".to_string() } else { "Z Code 授权被拒绝，请在 Z Code 中确认登录".to_string() }),
        status if api_key => return Err(format!("zcode_usage:http:{}", status.as_u16())),
        status => return Err(format!("Z Code 用量服务返回 {}", status.as_u16())),
    }
    let bytes = response.bytes().await.map_err(|_| if api_key { "zcode_usage:network".to_string() } else { "读取 Z Code 用量失败".to_string() })?;
    if bytes.len() > 1024 * 1024 { return Err(if api_key { "zcode_usage:response".to_string() } else { "Z Code 用量响应过大".to_string() }); }
    serde_json::from_slice(&bytes).map_err(|_| if api_key { "zcode_usage:response".to_string() } else { "Z Code 用量响应无效".to_string() })
}

/// The newest client runtime installed, which the trial service asks for as `app_version`.
fn app_version(dir: &Path) -> Option<String> {
    fs::read_dir(dir.join("runtime/provider/windows-x86_64")).into_iter().flatten().flatten().filter_map(|entry| {
        let name = entry.file_name().into_string().ok()?;
        let parts = name.split('.').map(str::parse::<u32>).collect::<Result<Vec<_>, _>>().ok()?;
        (parts.len() == 3).then_some((parts, name))
    }).max().map(|(_, name)| name)
}

async fn fetch_desktop(path: &Path) -> Result<Option<AgentUsage>, String> {
    let Some(root) = read_json(path) else { return Ok(None) };
    let account = login(&root, path)?;
    let client = reqwest::Client::builder().connect_timeout(Duration::from_secs(4)).timeout(Duration::from_secs(8))
        .redirect(Policy::none()).build().map_err(|_| "无法创建网络请求".to_string())?;
    let key = account.coding_subject.as_ref()
        .map(|id| format!("account-provider:coding-plan:account:{}-individual-coding-plan:account:{id}:api-key", account.family))
        .filter(|key| root.get(key).is_some());
    if let Some(key) = key {
        let host = coding_plan_host(account.family);
        let url = Url::parse(&format!("{host}/api/monitor/usage/quota/limit")).map_err(|error| error.to_string())?;
        let answer = get(&client, url, &value(&root, &key, path)?, None, false).await?;
        if success(&answer) { return Ok(coding(&answer, current_unix_millis())); }
        let message = answer["msg"].as_str().or_else(|| answer["message"].as_str()).unwrap_or_default().to_lowercase();
        if !(message.contains("coding plan") || message.contains("codingplan")) {
            return Err(format!("Z Code 编程套餐查询失败（{}）", answer["code"]));
        }
    }
    let dir = path.parent().unwrap_or(path);
    let mut url = Url::parse("https://zcode.z.ai/api/v1/zcode-plan/billing/balance").map_err(|error| error.to_string())?;
    if let Some(version) = app_version(dir) { url.query_pairs_mut().append_pair("app_version", &version); }
    let device = read_json(&dir.join("telemetry-state.json"))
        .and_then(|state| state["deviceMid"].as_str().filter(|s| !s.is_empty() && s.bytes().all(|b| b.is_ascii_graphic())).map(str::to_string))
        .ok_or("请打开 Z Code，等它初始化设备信息后再看")?;
    let answer = get(&client, url, &format!("Bearer {}", account.jwt), Some(&device), false).await?;
    if !success(&answer) { return Err(format!("Z Code 体验额度暂不可用（{}）", answer["code"])); }
    Ok(start(&answer, current_unix_millis()))
}

async fn fetch_api_key(platform: ApiKeyPlatform, api_key: &str) -> Result<Option<AgentUsage>, String> {
    let client = reqwest::Client::builder().connect_timeout(Duration::from_secs(4)).timeout(Duration::from_secs(8))
        .redirect(Policy::none()).build().map_err(|_| "zcode_usage:network".to_string())?;
    let host = coding_plan_host(platform.as_str());
    let url = Url::parse(&format!("{host}/api/monitor/usage/quota/limit")).map_err(|_| "zcode_usage:request".to_string())?;
    let answer = get(&client, url, api_key, None, true).await?;
    if !success(&answer) { return Err("zcode_usage:rejected".to_string()); }
    Ok(coding(&answer, current_unix_millis()))
}

fn cache_identity(kind: AuthKind, platform: ApiKeyPlatform, api_key: Option<&str>, path: Option<&Path>) -> Option<String> {
    match kind {
        AuthKind::ApiKey => {
            let key = api_key?;
            let hash = digest::digest(&digest::SHA256, key.as_bytes());
            let fingerprint = hash.as_ref().iter().map(|byte| format!("{byte:02x}")).collect::<String>();
            Some(format!("api:{}:{fingerprint}", platform.as_str()))
        }
        AuthKind::Desktop => Some(format!("desktop:{}", path?.to_string_lossy())),
        AuthKind::None => None,
    }
}

pub(super) fn invalidate_cache() {
    if let Ok(mut last) = LAST.lock() { *last = None; }
}

/// Z Code's plan windows or trial balances; null when neither manual key nor desktop login exists.
#[tauri::command]
pub async fn get_zcode_usage() -> Result<Option<AgentUsage>, String> {
    let config = read_config()?;
    let api_key = config.api_key.as_deref().filter(|key| !key.trim().is_empty());
    let path: Option<PathBuf> = if api_key.is_some() { None } else { Some(credentials_path(&crate::system::windows_home_dir()?)) };
    let kind = auth_kind(api_key, path.as_deref().is_some_and(Path::is_file));
    let identity = cache_identity(kind, config.platform, api_key, path.as_deref());
    let Some(identity) = identity else { return Ok(None) };
    let kept = LAST.lock().ok().and_then(|last| last.as_ref()
        .filter(|(at, known, _)| at.elapsed() < KEEP_FOR && *known == identity)
        .map(|(_, _, usage)| usage.clone()));
    if let Some(usage) = kept { return Ok(usage); }
    let usage = match kind {
        AuthKind::ApiKey => match api_key { Some(key) => fetch_api_key(config.platform, key).await?, None => return Ok(None) },
        AuthKind::Desktop => match path.as_deref() { Some(path) => fetch_desktop(path).await?, None => return Ok(None) },
        AuthKind::None => return Ok(None),
    };
    if let Ok(mut last) = LAST.lock() { *last = Some((Instant::now(), identity, usage.clone())); }
    Ok(usage)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn coding_plan_windows() {
        let answer = json!({"code": "200", "data": {"limits": [
            {"type": "TOKENS_LIMIT", "percentage": "0.12", "unit": "3", "number": "5", "nextResetTime": 1_900_000_000_000_i64},
            {"type": "CREDIT_LIMIT", "percentage": 40, "unit": 6, "number": 1},
            {"type": "TIME_LIMIT", "percentage": 3, "unit": 5, "number": 1}]}});
        let usage = coding(&answer, 1).unwrap();
        assert!(success(&answer));
        assert_eq!(usage.five_hour.as_ref().map(|w| w.used), Some(12.0));
        assert_eq!(usage.five_hour.unwrap().resets_at, Some(1_900_000_000_000));
        assert_eq!(usage.seven_day.map(|w| w.used), Some(40.0));
        assert!(usage.models.is_empty());
    }

    #[test]
    fn coding_plan_host_matches_selected_platform() {
        assert_eq!(coding_plan_host("bigmodel"), "https://open.bigmodel.cn");
        assert_eq!(coding_plan_host("zai"), "https://api.z.ai");
    }

    #[test]
    fn api_key_takes_priority_over_desktop_credentials() {
        assert_eq!(auth_kind(Some("key"), true), AuthKind::ApiKey);
        assert_eq!(auth_kind(None, true), AuthKind::Desktop);
        assert_eq!(auth_kind(None, false), AuthKind::None);
    }

    #[test]
    fn token_limit_without_unit_uses_reset_span() {
        let now = 1_800_000_000_000_i64;
        let answer = json!({"data": {"limits": [
            {"type": "TOKENS_LIMIT", "percentage": "0.35", "unit": 3, "nextResetTime": now + 1_200_000},
            {"type": "TOKENS_LIMIT", "percentage": 35, "nextResetTime": now + 86_400_000}]}});
        let usage = coding(&answer, now).unwrap();
        assert_eq!(usage.five_hour.as_ref().map(|window| window.used), Some(35.0));
        assert_eq!(usage.seven_day.as_ref().map(|window| window.used), Some(35.0));
    }

    #[test]
    fn start_plan_balances() {
        let answer = json!({"code": 0, "data": {"balances": [
            {"show_name": "Trial", "total_units": 100, "remaining_units": 75, "expires_at": 4_000_000_000_i64},
            {"show_name": "Old", "total_units": 10, "remaining_units": 1, "expires_at": 1}]}});
        let usage = start(&answer, 2_000).unwrap();
        assert_eq!(usage.models.len(), 1);
        assert_eq!((usage.models[0].name.as_str(), usage.models[0].used), ("Trial", 25.0));
    }
}
