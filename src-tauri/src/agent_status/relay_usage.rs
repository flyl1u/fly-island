//! Balances from user-configured third-party relays (New API, Sub2API, custom endpoints).
//! Only sanitized numbers leave this module: no URL, key, token or response body reaches IPC or logs.

use std::{sync::Mutex, time::{Duration, Instant}};

use chrono::{Datelike, Duration as ChronoDuration, Local, TimeZone};
use reqwest::{header::{self, HeaderMap, HeaderName, HeaderValue}, redirect::Policy, Client, StatusCode};
use ring::digest;
use serde::Serialize;
use serde_json::{json, Value};

use super::relay_accounts::{self, RelayAccount};

const DEFAULT_QUOTA_PER_UNIT: f64 = 500_000.0;
const KEEP_FOR: Duration = Duration::from_secs(5 * 60);
const MAX_RESPONSE_BYTES: usize = 1024 * 1024;
static CACHE: Mutex<Option<(Instant, String, RelayUsage)>> = Mutex::new(None);

#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RelayBalance {
    pub(super) id: String,
    pub(super) name: String,
    pub(super) adapter: String,
    pub(super) currency: String,
    pub(super) remaining: Option<f64>,
    pub(super) used: Option<f64>,
    pub(super) total: Option<f64>,
    pub(super) unlimited: bool,
    pub(super) today_spend: Option<f64>,
    pub(super) week_spend: Option<f64>,
    pub(super) month_spend: Option<f64>,
    pub(super) all_time_spend: Option<f64>,
    /// Stable error code when this account could not be read; never network text.
    pub(super) problem: Option<&'static str>,
}

#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RelayUsage {
    pub(super) accounts: Vec<RelayBalance>,
    pub(super) updated_at: i64,
}

fn client() -> Result<Client, String> {
    Client::builder()
        .connect_timeout(Duration::from_secs(4))
        .timeout(Duration::from_secs(8))
        .redirect(Policy::none())
        .build()
        .map_err(|_| "relay:network".to_string())
}

fn headers(pairs: &[(&str, &str)]) -> Result<HeaderMap, String> {
    let mut map = HeaderMap::new();
    map.insert(header::ACCEPT, HeaderValue::from_static("application/json"));
    for (key, value) in pairs {
        let name = HeaderName::from_bytes(key.as_bytes()).map_err(|_| "relay:request".to_string())?;
        let mut secret = HeaderValue::from_str(value).map_err(|_| "relay:request".to_string())?;
        secret.set_sensitive(true);
        map.insert(name, secret);
    }
    Ok(map)
}

async fn get_json(client: &Client, url: &str, pairs: &[(&str, &str)]) -> Result<Value, String> {
    let response = client.get(url).headers(headers(pairs)?).send().await
        .map_err(|_| "relay:network".to_string())?;
    match response.status() {
        StatusCode::OK => {}
        StatusCode::UNAUTHORIZED => return Err("relay:unauthorized".to_string()),
        StatusCode::FORBIDDEN => return Err("relay:auth".to_string()),
        status => return Err(format!("relay:http:{}", status.as_u16())),
    }
    let bytes = response.bytes().await.map_err(|_| "relay:network".to_string())?;
    if bytes.len() > MAX_RESPONSE_BYTES {
        return Err("relay:response".to_string());
    }
    serde_json::from_slice(&bytes).map_err(|_| "relay:response".to_string())
}

async fn get_optional(client: &Client, url: &str, pairs: &[(&str, &str)]) -> Option<Value> {
    get_json(client, url, pairs).await.ok()
}

async fn newapi_usage(client: &Client, base_url: &str, start: i64, end: i64, pairs: &[(&str, &str)]) -> Option<Value> {
    let path = format!("{base_url}/api/data/self?start_timestamp={start}&end_timestamp={end}&default_time=day");
    get_optional(client, &path, pairs).await
}

async fn post_json(client: &Client, url: &str, body: Value) -> Result<Value, String> {
    let response = client.post(url).json(&body).send().await
        .map_err(|_| "relay:network".to_string())?;
    if response.status() != StatusCode::OK {
        return Err(format!("relay:http:{}", response.status().as_u16()));
    }
    let bytes = response.bytes().await.map_err(|_| "relay:network".to_string())?;
    if bytes.len() > MAX_RESPONSE_BYTES {
        return Err("relay:response".to_string());
    }
    serde_json::from_slice(&bytes).map_err(|_| "relay:response".to_string())
}

fn number(value: &Value) -> Option<f64> {
    value.as_f64().or_else(|| value.as_str()?.trim().parse::<f64>().ok())
        .filter(|number| number.is_finite())
}

fn data(value: &Value) -> &Value {
    if value.get("data").is_some() { &value["data"] } else { value }
}

fn quota_per_unit(status: &Value) -> f64 {
    number(&data(status)["quota_per_unit"]).filter(|value| *value > 0.0).unwrap_or(DEFAULT_QUOTA_PER_UNIT)
}

fn amount(value: &Value, unit: f64) -> Option<f64> {
    number(value).map(|value| value.max(0.0) / unit)
}

fn currency(value: &Value) -> String {
    value.as_str()
        .filter(|code| code.len() <= 8 && code.chars().all(|c| c.is_ascii_alphabetic()))
        .unwrap_or("USD")
        .to_uppercase()
}

fn blank(account: &RelayAccount) -> RelayBalance {
    RelayBalance {
        id: account.id.clone(),
        name: account.name.clone(),
        adapter: account.adapter.clone(),
        currency: account.currency.clone().unwrap_or_else(|| "USD".to_string()),
        remaining: None,
        used: None,
        total: None,
        unlimited: false,
        today_spend: None,
        week_spend: None,
        month_spend: None,
        all_time_spend: None,
        problem: None,
    }
}

fn problem(account: &RelayAccount, code: &'static str) -> RelayBalance {
    RelayBalance { problem: Some(code), ..blank(account) }
}

fn midnight(date: chrono::NaiveDate) -> Option<i64> {
    let local = date.and_hms_opt(0, 0, 0)?;
    Local.from_local_datetime(&local).single().map(|at| at.timestamp())
}

/// Sums New API's billing rows into a spend amount. An empty array means zero spend,
/// a malformed one means unknown: enrichment must never hide a valid balance.
fn newapi_spend(payload: &Value, unit: f64) -> Option<f64> {
    let rows = data(payload).as_array()?;
    let mut quota = 0.0;
    for row in rows {
        let value = number(&row["quota"])?;
        if value < 0.0 { return None }
        quota += value;
    }
    Some(quota / unit)
}

fn newapi_account(account: &RelayAccount, payload: &Value, status: &Value, enrichment: Option<&[Option<Value>]>) -> Option<RelayBalance> {
    let payload = data(payload);
    if !payload.is_object() { return None }
    let unit = quota_per_unit(status);
    let raw = number(&payload["quota"])?;
    let unlimited = payload["unlimited_quota"] == true || raw == -1.0;
    let mut result = blank(account);
    result.currency = currency(&data(status)["currency"]);
    result.unlimited = unlimited;
    result.remaining = if unlimited { None } else { amount(&payload["quota"], unit) };
    result.used = amount(&payload["used_quota"], unit);
    result.total = match (result.remaining, result.used) {
        (Some(remaining), Some(used)) => Some(remaining + used),
        _ => None,
    };
    if let Some([today, week, month]) = enrichment {
        result.today_spend = today.as_ref().and_then(|value| newapi_spend(value, unit));
        result.week_spend = week.as_ref().and_then(|value| newapi_spend(value, unit));
        result.month_spend = month.as_ref().and_then(|value| newapi_spend(value, unit));
    }
    Some(result)
}

fn newapi_token(account: &RelayAccount, payload: &Value) -> Option<RelayBalance> {
    let payload = data(payload);
    if !payload.is_object() { return None }
    let mut result = blank(account);
    result.unlimited = payload["unlimited_quota"] == true;
    // New API reports a negative sentinel in `total_available` for unlimited tokens; it is not a balance.
    result.remaining = if result.unlimited { None } else { amount(&payload["total_available"], DEFAULT_QUOTA_PER_UNIT) };
    result.used = amount(&payload["total_used"], DEFAULT_QUOTA_PER_UNIT);
    result.total = match (result.remaining, result.used) {
        (Some(remaining), Some(used)) => Some(remaining + used),
        _ => None,
    };
    Some(result)
}

fn sub2api(account: &RelayAccount, payload: &Value, month: Option<&Value>, all_time: Option<&Value>) -> Option<RelayBalance> {
    if number(&payload["code"]) != Some(0.0) { return None }
    let payload = data(payload);
    let balance = number(&payload["balance"])?;
    let mut result = blank(account);
    result.remaining = Some(balance);
    result.total = Some(balance);
    result.month_spend = month.and_then(|value| number(&data(value)["total_actual_cost"]));
    result.all_time_spend = all_time.and_then(|value| number(&data(value)["total_actual_cost"]));
    Some(result)
}

fn read_path<'a>(value: &'a Value, path: &str) -> Option<&'a Value> {
    let mut current = value;
    for part in path.split('.') {
        let (key, index) = match part.split_once('[') {
            Some((key, rest)) => (key, rest.trim_end_matches(']').parse::<usize>().ok()),
            None => (part, None),
        };
        current = current.get(key)?;
        if let Some(index) = index { current = current.get(index)?; }
    }
    Some(current)
}

fn custom(account: &RelayAccount, payload: &Value) -> Option<RelayBalance> {
    if payload["success"] == false || payload["code"] == false { return None }
    let divisor = account.divisor.filter(|value| *value > 0.0).unwrap_or(1.0);
    let mapped = |path: Option<&str>| -> Option<f64> {
        number(read_path(payload, path?)?).map(|value| value / divisor)
    };
    let remaining = mapped(account.remaining_path.as_deref())?;
    let mut result = blank(account);
    result.currency = account.currency.clone().unwrap_or_else(|| "USD".to_string());
    result.remaining = Some(remaining);
    result.used = mapped(account.used_path.as_deref());
    result.total = mapped(account.total_path.as_deref());
    Some(result)
}

async fn fetch_newapi_account(client: &Client, account: &RelayAccount) -> Result<RelayBalance, String> {
    let access = account.access_token.as_deref().ok_or("relay:credential")?;
    let user = account.user_id.as_deref().filter(|value| !value.is_empty());
    let auth = format!("Bearer {access}");
    let mut pairs = vec![("Authorization", auth.as_str())];
    if let Some(user) = user { pairs.push(("New-Api-User", user)); }
    let payload = get_json(client, &format!("{}/api/user/self", account.base_url), &pairs).await?;
    let status = get_json(client, &format!("{}/api/status", account.base_url), &[]).await.unwrap_or_default();
    let today = midnight(Local::now().date_naive());
    let week = midnight(Local::now().date_naive() - ChronoDuration::days(6));
    let today_date = Local::now().date_naive();
    let month = midnight(today_date.with_day(1).unwrap_or(today_date));
    let enrichment = match (today, week, month) {
        (Some(today), Some(week), Some(month)) => {
            let end = Local::now().timestamp();
            let fetch = |start: i64| newapi_usage(client, &account.base_url, start, end, &pairs);
            Some([fetch(today).await, fetch(week).await, fetch(month).await])
        }
        _ => None,
    };
    let mut result = newapi_account(account, &payload, &status, enrichment.as_ref().map(|values| values.as_slice())).ok_or("relay:format")?;
    if status.get("enable_data_export") == Some(&Value::Bool(false)) {
        result.today_spend = None;
        result.week_spend = None;
        result.month_spend = None;
    }
    Ok(result)
}

async fn fetch_newapi_token(client: &Client, account: &RelayAccount) -> Result<RelayBalance, String> {
    let key = account.api_key.as_deref().ok_or("relay:credential")?;
    let auth = format!("Bearer {key}");
    let payload = get_json(client, &format!("{}/api/usage/token/", account.base_url), &[("Authorization", auth.as_str())]).await?;
    newapi_token(account, &payload).ok_or_else(|| "relay:format".to_string())
}

async fn fetch_sub2api(client: &Client, account: &RelayAccount) -> Result<RelayBalance, String> {
    let access = account.access_token.as_deref().ok_or("relay:credential")?;
    let url = format!("{}/api/v1/auth/me", account.base_url);
    let mut auth = format!("Bearer {access}");
    let mut payload = get_json(client, &url, &[("Authorization", auth.as_str())]).await;
    if matches!(payload.as_ref().err().map(String::as_str), Some("relay:unauthorized")) {
        let refresh = account.refresh_token.as_deref().ok_or("relay:auth")?;
        let renewed = post_json(client, &format!("{}/api/v1/auth/refresh", account.base_url),
            json!({ "refresh_token": refresh })).await?;
        let renewed = data(&renewed);
        let next_access = renewed["access_token"].as_str().ok_or("relay:auth")?;
        let next_refresh = renewed["refresh_token"].as_str().ok_or("relay:auth")?;
        relay_accounts::rotate_tokens(&account.id, access, refresh, next_access, next_refresh)?;
        auth = format!("Bearer {next_access}");
        payload = get_json(client, &url, &[("Authorization", auth.as_str())]).await;
    }
    let payload = payload?;
    let pairs = [("Authorization", auth.as_str())];
    let month = get_optional(client, &format!("{}/api/v1/usage/stats?period=month", account.base_url), &pairs).await;
    let all_time = get_optional(client, &format!("{}/api/v1/usage/dashboard/stats", account.base_url), &pairs).await;
    sub2api(account, &payload, month.as_ref(), all_time.as_ref()).ok_or_else(|| "relay:format".to_string())
}

async fn fetch_custom(client: &Client, account: &RelayAccount) -> Result<RelayBalance, String> {
    let key = account.api_key.as_deref().ok_or("relay:credential")?;
    let header = if account.auth_mode.as_deref() == Some("x-api-key") { "x-api-key" } else { "Authorization" };
    let value = if header == "Authorization" { format!("Bearer {key}") } else { key.to_string() };
    let path = account.endpoint_path.as_deref().unwrap_or("/user/balance");
    let payload = get_json(client, &format!("{}{}", account.base_url, path), &[(header, value.as_str())]).await?;
    custom(account, &payload).ok_or_else(|| "relay:format".to_string())
}

async fn fetch_one(client: &Client, account: &RelayAccount) -> RelayBalance {
    let result = match account.adapter.as_str() {
        "newapi-account" => fetch_newapi_account(client, account).await,
        "newapi-token" => fetch_newapi_token(client, account).await,
        "sub2api" => fetch_sub2api(client, account).await,
        "custom" => fetch_custom(client, account).await,
        _ => Err("relay:account:adapter".to_string()),
    };
    match result {
        Ok(balance) => balance,
        Err(error) => problem(account, match error.as_str() {
            "relay:network" => "network",
            "relay:unauthorized" | "relay:auth" => "auth",
            "relay:credential" => "credential",
            "relay:response" => "format",
            error if error.starts_with("relay:http:") => "http",
            _ => "format",
        }),
    }
}

fn identity(accounts: &[RelayAccount]) -> String {
    let seed: String = accounts.iter().map(|account| {
        let secret = account.secret().unwrap_or("");
        format!("{}:{}:{}:{}", account.id, account.adapter, account.base_url, secret)
    }).collect();
    digest::digest(&digest::SHA256, seed.as_bytes()).as_ref().iter().map(|byte| format!("{byte:02x}")).collect()
}

pub(super) fn invalidate_cache() {
    if let Ok(mut cache) = CACHE.lock() { *cache = None; }
}

/// Saves only after a real balance probe succeeds, as the reference account service does.
pub(super) async fn probe(account: RelayAccount) -> Result<(), String> {
    let client = client()?;
    let balance = fetch_one(&client, &account).await;
    if balance.problem.is_some() || (balance.remaining.is_none() && balance.used.is_none()) {
        return Err(balance.problem.unwrap_or("format").to_string());
    }
    Ok(())
}

#[tauri::command]
pub async fn check_relay_account(input: RelayAccount) -> Result<(), String> {
    let stored = relay_accounts::load().unwrap_or_default();
    let account = relay_accounts::merge(input, &stored)?;
    probe(account).await
}

#[tauri::command]
pub async fn get_relay_usage() -> Result<RelayUsage, String> {
    let accounts = relay_accounts::load()?;
    let now = super::snapshot::current_unix_millis();
    if accounts.is_empty() {
        return Ok(RelayUsage { accounts: Vec::new(), updated_at: now });
    }
    let known = identity(&accounts);
    if let Ok(cache) = CACHE.lock() {
        if let Some((at, fingerprint, usage)) = cache.as_ref() {
            if at.elapsed() < KEEP_FOR && fingerprint == &known { return Ok(usage.clone()); }
        }
    }
    let client = client()?;
    let mut balances = Vec::with_capacity(accounts.len());
    for account in &accounts {
        balances.push(fetch_one(&client, account).await);
    }
    let usage = RelayUsage { accounts: balances, updated_at: now };
    if let Ok(mut cache) = CACHE.lock() { *cache = Some((Instant::now(), known, usage.clone())); }
    Ok(usage)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn account(adapter: &str) -> RelayAccount {
        RelayAccount {
            id: "a".to_string(), name: "A".to_string(), adapter: adapter.to_string(),
            base_url: "https://relay.example.com".to_string(),
            access_token: Some("token".to_string()), refresh_token: None, api_key: Some("key".to_string()),
            user_id: None, endpoint_path: Some("/user/balance".to_string()),
            remaining_path: Some("data.balance".to_string()), used_path: None, total_path: None,
            auth_mode: Some("bearer".to_string()), currency: Some("CNY".to_string()), divisor: Some(500_000.0),
        }
    }

    #[test]
    fn newapi_account_reads_remaining_and_spend() {
        let today = json!({"data": [{"quota": 1000}]});
        let week = json!({"data": [{"quota": 2000}]});
        let month = json!({"data": []});
        let result = newapi_account(&account("newapi-account"),
            &json!({"data": {"quota": 1000000, "used_quota": 500000}}), &json!({"data": {"quota_per_unit": 500000, "currency": "CNY"}}),
            Some(&[Some(today), Some(week), Some(month)])).unwrap();
        assert_eq!(result.remaining, Some(2.0));
        assert_eq!(result.used, Some(1.0));
        assert_eq!(result.total, Some(3.0));
        assert_eq!(result.currency, "CNY");
        assert_eq!(result.today_spend, Some(0.002));
        assert_eq!(result.week_spend, Some(0.004));
        assert_eq!(result.month_spend, Some(0.0));
    }

    #[test]
    fn unlimited_quota_has_no_number() {
        let result = newapi_account(&account("newapi-account"),
            &json!({"data": {"quota": -1, "unlimited_quota": true}}), &json!({}), None).unwrap();
        assert!(result.unlimited);
        assert_eq!(result.remaining, None);
    }

    #[test]
    fn unlimited_token_ignores_negative_sentinel() {
        let result = newapi_token(&account("newapi-token"), &json!({
            "code": true,
            "data": {"total_available": -11048010, "total_used": 11048010, "unlimited_quota": true}
        })).unwrap();
        assert!(result.unlimited);
        assert_eq!(result.remaining, None);
        assert_eq!(result.total, None);
        assert!((result.used.unwrap() - 22.09602).abs() < 0.0001);
    }

    #[test]
    fn sub2api_and_custom_paths() {
        let result = sub2api(&account("sub2api"), &json!({"code": 0, "data": {"id": 1, "balance": 12.5}}),
            Some(&json!({"code": 0, "data": {"total_actual_cost": 3.5}})), None).unwrap();
        assert_eq!(result.remaining, Some(12.5));
        assert_eq!(result.month_spend, Some(3.5));
        assert!(sub2api(&account("sub2api"), &json!({"code": 1}), None, None).is_none());
        let custom_account = account("custom");
        let result = custom(&custom_account, &json!({"data": {"balance": 250000}})).unwrap();
        assert_eq!(result.remaining, Some(0.5));
        assert_eq!(result.currency, "CNY");
        assert!(custom(&custom_account, &json!({"success": false})).is_none());
    }

    #[test]
    fn json_path_supports_array_index() {
        let value = json!({"data": [{"balance": 9}]});
        assert_eq!(read_path(&value, "data[0].balance").and_then(number), Some(9.0));
    }
}
