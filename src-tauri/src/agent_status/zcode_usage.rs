//! Z Code's plan usage, asked with the desktop app's own sign-in (zcode_credentials.rs): the
//! Coding Plan's token windows when the account has one, else the Start Plan's trial balances.
//! Endpoints and shapes as in xiaotang-daozai's `zcode_quota.rs` (MIT). Kept for five minutes.

use std::{fs, io::Read, path::Path, sync::Mutex, time::{Duration, Instant}};

use reqwest::{header, redirect::Policy, StatusCode, Url};
use serde_json::Value;

use super::{kimi_usage::{place, reset_at}, snapshot::current_unix_millis, usage::{AgentUsage, UsageSource, UsageWindow},
    zcode_credentials::{credentials_path, login, value}};

const KEEP_FOR: Duration = Duration::from_secs(5 * 60);
static LAST: Mutex<Option<(Instant, Option<AgentUsage>)>> = Mutex::new(None);

fn read_json(path: &Path) -> Option<Value> {
    let mut raw = Vec::new();
    fs::File::open(path).ok()?.take(1024 * 1024).read_to_end(&mut raw).ok()?;
    serde_json::from_slice(raw.strip_prefix(b"\xef\xbb\xbf").unwrap_or(&raw)).ok()
}

fn number(value: &Value) -> Option<f64> {
    value.as_f64().or_else(|| value.as_str()?.trim().parse().ok())
}

fn success(value: &Value) -> bool {
    matches!(value["code"].as_i64(), Some(0 | 200)) || (value["code"].is_null() && value["success"] == true)
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
        let Some(used) = number(&row["percentage"]).filter(|v| (0.0..=100.0).contains(v)) else { continue };
        let unit = match row["unit"].as_i64() { Some(1) => Some(86_400), Some(3) => Some(3_600), Some(5) => Some(60), Some(6) => Some(604_800), _ => None };
        let seconds = row["number"].as_i64().filter(|n| *n > 0).zip(unit).and_then(|(n, m)| n.checked_mul(m));
        let window = UsageWindow { name: String::new(), used, resets_at: reset_at(&row["nextResetTime"]).filter(|at| *at > 0) };
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

async fn get(client: &reqwest::Client, url: Url, auth: &str, device: Option<&str>) -> Result<Value, String> {
    let mut auth = header::HeaderValue::from_str(auth).map_err(|_| "Z Code 的登录凭据无效".to_string())?;
    auth.set_sensitive(true);
    let mut request = client.get(url).header(header::AUTHORIZATION, auth).header(header::ACCEPT, "application/json");
    if let Some(device) = device { request = request.header("X-Device-Mid", device); }
    let response = request.send().await.map_err(|_| "无法连接 Z Code 用量服务".to_string())?;
    match response.status() {
        StatusCode::OK => {}
        StatusCode::UNAUTHORIZED | StatusCode::FORBIDDEN => return Err("Z Code 授权被拒绝，请在 Z Code 中确认登录".to_string()),
        status => return Err(format!("Z Code 用量服务返回 {}", status.as_u16())),
    }
    let bytes = response.bytes().await.map_err(|_| "读取 Z Code 用量失败".to_string())?;
    serde_json::from_slice(&bytes[..bytes.len().min(1024 * 1024)]).map_err(|_| "Z Code 用量响应无效".to_string())
}

/// The newest client runtime installed, which the trial service asks for as `app_version`.
fn app_version(dir: &Path) -> Option<String> {
    fs::read_dir(dir.join("runtime/provider/windows-x86_64")).into_iter().flatten().flatten().filter_map(|entry| {
        let name = entry.file_name().into_string().ok()?;
        let parts = name.split('.').map(str::parse::<u32>).collect::<Result<Vec<_>, _>>().ok()?;
        (parts.len() == 3).then_some((parts, name))
    }).max().map(|(_, name)| name)
}

async fn fetch(path: &Path) -> Result<Option<AgentUsage>, String> {
    let Some(root) = read_json(path) else { return Ok(None) };
    let account = login(&root, path)?;
    let client = reqwest::Client::builder().connect_timeout(Duration::from_secs(4)).timeout(Duration::from_secs(8))
        .redirect(Policy::none()).build().map_err(|_| "无法创建网络请求".to_string())?;
    let key = account.coding_subject.as_ref()
        .map(|id| format!("account-provider:coding-plan:account:{}-individual-coding-plan:account:{id}:api-key", account.family))
        .filter(|key| root.get(key).is_some());
    if let Some(key) = key {
        let host = if account.family == "zai" { "https://api.z.ai" } else { "https://bigmodel.cn" };
        let url = Url::parse(&format!("{host}/api/monitor/usage/quota/limit")).map_err(|error| error.to_string())?;
        let answer = get(&client, url, &value(&root, &key, path)?, None).await?;
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
    let answer = get(&client, url, &format!("Bearer {}", account.jwt), Some(&device)).await?;
    if !success(&answer) { return Err(format!("Z Code 体验额度暂不可用（{}）", answer["code"])); }
    Ok(start(&answer, current_unix_millis()))
}

/// Z Code's plan windows or trial balances; null when Z Code is not installed or signed in.
#[tauri::command]
pub async fn get_zcode_usage() -> Result<Option<AgentUsage>, String> {
    let path = credentials_path(&crate::system::windows_home_dir()?);
    if !path.is_file() { return Ok(None); }
    let kept = LAST.lock().ok().and_then(|last| last.as_ref().filter(|(at, _)| at.elapsed() < KEEP_FOR).map(|(_, usage)| usage.clone()));
    if let Some(usage) = kept { return Ok(usage); }
    let usage = fetch(&path).await?;
    if let Ok(mut last) = LAST.lock() { *last = Some((Instant::now(), usage.clone())); }
    Ok(usage)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn coding_plan_windows() {
        let answer = json!({"code": 200, "data": {"limits": [
            {"type": "TOKENS_LIMIT", "percentage": 12, "unit": 3, "number": 5, "nextResetTime": 1_900_000_000_000_i64},
            {"type": "TOKENS_LIMIT", "percentage": 40, "unit": 6, "number": 1},
            {"type": "TIME_LIMIT", "percentage": 3, "unit": 5, "number": 1}]}});
        let usage = coding(&answer, 1).unwrap();
        assert_eq!(usage.five_hour.as_ref().map(|w| w.used), Some(12.0));
        assert_eq!(usage.five_hour.unwrap().resets_at, Some(1_900_000_000_000));
        assert_eq!(usage.seven_day.map(|w| w.used), Some(40.0));
        assert!(usage.models.is_empty());
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
