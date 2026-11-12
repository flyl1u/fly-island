//! DSH has prepaid wallets, not subscription windows. The official balance endpoints are
//! queried with DSH's existing credential; only sanitized amounts leave this module. No disk
//! cache, response body, key, token or network error is written to logs or returned over IPC.

use std::{fs, path::Path, sync::{Mutex, PoisonError}, time::Duration};

use serde::Serialize;
use serde_json::Value;

use super::{dsh_credentials::{self, Credential}, dsh_sessions, snapshot::{current_unix_millis, system_time_to_unix_millis}};

const MAX_RESPONSE_BYTES: usize = 64 * 1024;
const REFRESH_MS: i64 = 5 * 60_000;
const RETRY_MS: i64 = 60_000;
static CACHE: Mutex<Option<CachedBalance>> = Mutex::new(None);

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DshWallet {
    pub(super) currency: String,
    /// Decimal strings preserve the precision returned by DeepSeek.
    pub(super) total: String,
    pub(super) granted: String,
    pub(super) topped_up: String,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DshUsage {
    pub(super) updated_at: i64,
    pub(super) available: bool,
    pub(super) wallets: Vec<DshWallet>,
    /// "dshApi" or "dshAccount"; the two billing accounts are never combined.
    pub(super) source: &'static str,
}

struct CachedBalance {
    fingerprint: String,
    attempted_at: i64,
    usage: Option<DshUsage>,
}

fn amount(value: &Value) -> Option<String> {
    let text = value.as_str()?;
    let number = text.parse::<f64>().ok()?;
    (text.len() <= 64 && number.is_finite()).then(|| text.to_string())
}

/// Account wallets give the two balances separately. Add their decimal coefficients exactly,
/// rather than exposing binary float artifacts (e.g. 0.1 + 0.2) in the hover card.
fn wallet_total(normal: &str, bonus: &str) -> Option<String> {
    let decimal = |text: &str| -> Option<(i128, u32)> {
        let (mantissa, exponent) = text.split_once(['e', 'E']).unwrap_or((text, "0"));
        let exponent = exponent.parse::<i32>().ok()?;
        let negative = mantissa.starts_with('-');
        let mantissa = mantissa.trim_start_matches('-');
        let (whole, fraction) = mantissa.split_once('.').unwrap_or((mantissa, ""));
        let digits = format!("{whole}{fraction}");
        if digits.is_empty() || !digits.bytes().all(|c| c.is_ascii_digit()) { return None; }
        let mut coefficient = digits.parse::<i128>().ok()?;
        let scale = i32::try_from(fraction.len()).ok()?.checked_sub(exponent)?;
        if !(-18..=18).contains(&scale) { return None; }
        if scale < 0 { coefficient = coefficient.checked_mul(10_i128.checked_pow(scale.unsigned_abs())?)?; }
        if negative { coefficient = coefficient.checked_neg()?; }
        Some((coefficient, scale.max(0) as u32))
    };
    let (normal, normal_scale) = decimal(normal)?;
    let (bonus, bonus_scale) = decimal(bonus)?;
    let scale = normal_scale.max(bonus_scale);
    let sum = normal.checked_mul(10_i128.checked_pow(scale - normal_scale)?)?
        .checked_add(bonus.checked_mul(10_i128.checked_pow(scale - bonus_scale)?)?)?;
    if sum == 0 { return Some("0".to_string()); }
    let sign = if sum < 0 { "-" } else { "" };
    let mut digits = sum.unsigned_abs().to_string();
    if scale == 0 { return Some(format!("{sign}{digits}")); }
    while digits.len() <= scale as usize { digits.insert(0, '0'); }
    digits.insert(digits.len() - scale as usize, '.');
    Some(format!("{sign}{}", digits.trim_end_matches('0').trim_end_matches('.')))
}

pub(super) fn parse_api(value: &Value, now: i64) -> Option<DshUsage> {
    let wallets: Vec<_> = value["balance_infos"].as_array()?.iter().map(|wallet| {
        let currency = wallet["currency"].as_str().filter(|s| matches!(*s, "CNY" | "USD"))?;
        Some(DshWallet { currency: currency.to_string(), total: amount(&wallet["total_balance"])?,
            granted: amount(&wallet["granted_balance"])?, topped_up: amount(&wallet["topped_up_balance"])? })
    }).collect::<Option<_>>()?;
    if wallets.is_empty() { return None; }
    Some(DshUsage { updated_at: now, available: value["is_available"].as_bool()?, wallets, source: "dshApi" })
}

pub(super) fn parse_account(value: &Value, now: i64) -> Option<DshUsage> {
    if value["code"] != 0 || value["data"]["biz_code"] != 0 { return None; }
    let payload = &value["data"]["biz_data"];
    let normal = payload["normal_wallets"].as_array()?;
    let bonus = payload["bonus_wallets"].as_array()?;
    let mut wallets = Vec::new();
    for currency in ["CNY", "USD"] {
        let find = |items: &[Value]| -> Option<String> {
            match items.iter().find(|wallet| wallet["currency"] == currency) {
                Some(wallet) => amount(&wallet["balance"]),
                None => Some("0".to_string()),
            }
        };
        if !normal.iter().chain(bonus).any(|wallet| wallet["currency"] == currency) { continue; }
        let topped_up = find(normal)?;
        let granted = find(bonus)?;
        let total = wallet_total(&topped_up, &granted)?;
        wallets.push(DshWallet { currency: currency.to_string(), total, topped_up, granted });
    }
    if wallets.is_empty() { return None; }
    let available = wallets.iter().any(|wallet| wallet.total.parse::<f64>().is_ok_and(|total| total > 0.0));
    Some(DshUsage { updated_at: now, available, wallets, source: "dshAccount" })
}

/// Follow only the newest session's known first-party billing route. A custom provider (or
/// missing projection) has unknown billing, rather than borrowing an unrelated API key.
fn billing_provider(root: &Path) -> Option<String> {
    let mut checkpoints: Vec<_> = fs::read_dir(root.join("storages/session_projcache/sessions"))
        .into_iter().flatten().flatten().filter_map(|entry| {
            let modified = entry.metadata().ok()?.modified().ok().and_then(system_time_to_unix_millis)?;
            Some((modified, entry.path()))
        }).collect();
    checkpoints.sort_by_key(|(time, _)| std::cmp::Reverse(*time));
    for (_, path) in checkpoints.into_iter().take(512) {
        let Some(value) = dsh_sessions::read_json(&path, 512 * 1024) else { continue; };
        if !matches!(value["version"].as_u64(), Some(3..=7)) { continue; }
        let rows = &value["record"]["rows"];
        let selection = &rows["modelSelection"];
        if selection["ver"] != 2 { continue; }
        let Some(provider) = selection["val"]["lastUsed"]["provider"].as_str() else { continue; };
        return matches!(provider, "deepseek-official" | "deepseek-account").then(|| provider.to_string());
    }
    None
}

async fn query(credential: &Credential) -> Option<DshUsage> {
    let client = reqwest::Client::builder().timeout(Duration::from_secs(5))
        .redirect(reqwest::redirect::Policy::none()).build().ok()?;
    let request = match credential {
        Credential::ApiKey(key) => client.get("https://api.deepseek.com/user/balance").bearer_auth(key),
        Credential::Account(token) => client.get("https://platform.deepseek.com/api/v0/users/get_user_summary")
            .header("x-dsh-auth-token", token),
    };
    let mut response = request.send().await.ok()?.error_for_status().ok()?;
    if response.content_length().is_some_and(|size| size > MAX_RESPONSE_BYTES as u64) { return None; }
    let mut body = Vec::new();
    while let Some(chunk) = response.chunk().await.ok()? {
        if body.len() + chunk.len() > MAX_RESPONSE_BYTES { return None; }
        body.extend_from_slice(&chunk);
    }
    let value = serde_json::from_slice(&body).ok()?;
    match credential {
        Credential::ApiKey(_) => parse_api(&value, current_unix_millis()),
        Credential::Account(_) => parse_account(&value, current_unix_millis()),
    }
}

pub(super) async fn read_usage(home: &Path) -> Option<DshUsage> {
    let home = home.to_path_buf();
    let credential = tauri::async_runtime::spawn_blocking(move || {
        let root = dsh_sessions::data_root(&home)?;
        if !dsh_credentials::official_route(&root) { return None; }
        dsh_credentials::read(&root, &billing_provider(&root)?)
    }).await.ok().flatten();
    let Some(credential) = credential else {
        *CACHE.lock().unwrap_or_else(PoisonError::into_inner) = None;
        return None;
    };
    let fingerprint = credential.fingerprint();
    let now = current_unix_millis();
    {
        let mut cache = CACHE.lock().unwrap_or_else(PoisonError::into_inner);
        if let Some(cached) = cache.as_ref().filter(|c| c.fingerprint == fingerprint) {
            let retry = if cached.usage.as_ref().is_some_and(|usage| usage.updated_at >= cached.attempted_at) { REFRESH_MS } else { RETRY_MS };
            if now.saturating_sub(cached.attempted_at) < retry { return cached.usage.clone(); }
        } else {
            *cache = Some(CachedBalance { fingerprint: fingerprint.clone(), attempted_at: now, usage: None });
        }
        if let Some(cache) = cache.as_mut() { cache.attempted_at = now; }
    }
    let result = query(&credential).await;
    let mut cache = CACHE.lock().unwrap_or_else(PoisonError::into_inner);
    let cached = cache.as_mut().filter(|cache| cache.fingerprint == fingerprint)?;
    if let Some(usage) = result { cached.usage = Some(usage); }
    cached.usage.clone()
}

#[tauri::command]
pub async fn get_dsh_usage() -> Result<Option<DshUsage>, String> {
    let Ok(home) = crate::system::windows_home_dir() else { return Ok(None); };
    Ok(read_usage(&home).await)
}

#[cfg(test)]
#[path = "dsh_usage_tests.rs"]
mod tests;
