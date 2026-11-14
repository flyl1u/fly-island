//! DSH has prepaid wallets, not subscription windows. The official balance endpoints are
//! queried with DSH's existing credential; only sanitized amounts leave this module. No disk
//! cache, response body, key, token or network error is written to logs or returned over IPC.

use std::{env, fs, path::{Path, PathBuf}, sync::{Mutex, PoisonError}, time::Duration};

use serde::Serialize;
use serde_json::Value;

use super::{dsh_credentials::{self, Credential}, dsh_desktop, dsh_sessions, snapshot::{current_unix_millis, system_time_to_unix_millis}};

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

/// Why no balance is shown. Sent to the island as `dsh:<code>` so it can say so instead of
/// leaving the ring out silently; never carries a path, key, response body or network error text.
pub(super) type Problem = &'static str;
pub(super) const NO_SESSION: Problem = "noSession";
pub(super) const CUSTOM_PROVIDER: Problem = "customProvider";
pub(super) const CUSTOM_ROUTE: Problem = "customRoute";
pub(super) const NO_CREDENTIAL: Problem = "credential";
const TIMEOUT: Problem = "timeout";
const NETWORK: Problem = "network";
const AUTH: Problem = "auth";
const HTTP: Problem = "http";
const FORMAT: Problem = "format";

pub(super) struct CachedBalance {
    fingerprint: String,
    attempted_at: i64,
    usage: Option<DshUsage>,
    problem: Option<Problem>,
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

/// The newest checkpoint that names a billing route: its time and the route, `None` for a
/// custom provider. Checkpoints without a selection (blank sessions) are passed over.
fn latest_route(root: &Path) -> Option<(i64, Option<String>)> {
    let mut checkpoints: Vec<_> = fs::read_dir(root.join("storages/session_projcache/sessions"))
        .into_iter().flatten().flatten().filter_map(|entry| {
            let modified = entry.metadata().ok()?.modified().ok().and_then(system_time_to_unix_millis)?;
            Some((modified, entry.path()))
        }).collect();
    checkpoints.sort_by_key(|(time, _)| std::cmp::Reverse(*time));
    // A few dozen reach a non-blank session; 512 full parses made a store with an unknown format slow.
    for (modified, path) in checkpoints.into_iter().take(64) {
        let Some(value) = dsh_sessions::read_json(&path, 512 * 1024) else { continue; };
        if !dsh_sessions::known_envelope(&value) { continue; }
        let selection = &value["record"]["rows"]["modelSelection"];
        if !selection["ver"].as_u64().is_some_and(|ver| ver >= 2) { continue; }
        let Some(provider) = selection["val"]["lastUsed"]["provider"].as_str() else { continue; };
        let known = matches!(provider, "deepseek-official" | "deepseek-account").then(|| provider.to_string());
        return Some((modified, known));
    }
    None
}

/// Every DSH store that has sessions (DataElement's, the shared ~/.dsh, Beta, NEXT and a saved
/// custom directory), so users of any of them get a balance, not only of the first two.
fn stores(home: &Path) -> Vec<PathBuf> {
    let mut roots: Vec<PathBuf> = Vec::new();
    for (root, _) in dsh_desktop::roots(home, env::var_os("APPDATA").map(PathBuf::from)) {
        if dsh_sessions::has_checkpoints(&root) && !roots.contains(&root) { roots.push(root); }
    }
    roots
}

/// The credential of the store whose newest session is the most recent: the DSH in use now.
/// Ok(None): no DSH store at all, which stays quiet. Each refusal keeps its own reason.
pub(super) fn locate(home: &Path) -> Result<Option<Credential>, Problem> {
    locate_in(stores(home))
}

fn locate_in(stores: Vec<PathBuf>) -> Result<Option<Credential>, Problem> {
    if stores.is_empty() { return Ok(None); }
    let (root, provider) = stores.into_iter()
        .filter_map(|root| latest_route(&root).map(|(time, provider)| (time, root, provider)))
        .max_by_key(|(time, _, _)| *time)
        .map(|(_, root, provider)| (root, provider))
        .ok_or(NO_SESSION)?;
    let provider = provider.ok_or(CUSTOM_PROVIDER)?;
    if !dsh_credentials::official_route(&root) { return Err(CUSTOM_ROUTE); }
    dsh_credentials::read(&root, &provider).map(Some).ok_or(NO_CREDENTIAL)
}

fn request_problem(error: &reqwest::Error) -> Problem {
    let denied = error.status().is_some_and(|s| s == reqwest::StatusCode::UNAUTHORIZED || s == reqwest::StatusCode::FORBIDDEN);
    if error.is_timeout() { TIMEOUT }
    else if denied { AUTH }
    else if error.is_status() { HTTP }
    else if error.is_decode() || error.is_body() { FORMAT }
    else { NETWORK }
}

async fn query_once(client: &reqwest::Client, credential: &Credential) -> Result<DshUsage, Problem> {
    let request = match credential {
        Credential::ApiKey(key) => client.get("https://api.deepseek.com/user/balance").bearer_auth(key),
        Credential::Account(token) => client.get("https://platform.deepseek.com/api/v0/users/get_user_summary")
            .header("x-dsh-auth-token", token),
    };
    let mut response = request.send().await.and_then(reqwest::Response::error_for_status)
        .map_err(|e| request_problem(&e))?;
    if response.content_length().is_some_and(|size| size > MAX_RESPONSE_BYTES as u64) { return Err(FORMAT); }
    let mut body = Vec::new();
    while let Some(chunk) = response.chunk().await.map_err(|e| request_problem(&e))? {
        if body.len() + chunk.len() > MAX_RESPONSE_BYTES { return Err(FORMAT); }
        body.extend_from_slice(&chunk);
    }
    let value: Value = serde_json::from_slice(&body).map_err(|_| FORMAT)?;
    match credential {
        Credential::ApiKey(_) => parse_api(&value, current_unix_millis()).ok_or(FORMAT),
        // The account API answers 200 with a non-zero code for an expired or revoked grant.
        Credential::Account(_) => parse_account(&value, current_unix_millis())
            .ok_or(if value["code"] != 0 { AUTH } else { FORMAT }),
    }
}

/// Separate connect and total timeouts make a dead proxy fail fast; one retry covers a dropped
/// connection. Runs on the async runtime, never on the IPC or UI thread.
async fn query(credential: &Credential) -> Result<DshUsage, Problem> {
    let client = reqwest::Client::builder().connect_timeout(Duration::from_secs(4)).timeout(Duration::from_secs(8))
        .redirect(reqwest::redirect::Policy::none()).build().map_err(|_| NETWORK)?;
    match query_once(&client, credential).await {
        Err(TIMEOUT | NETWORK) => query_once(&client, credential).await,
        result => result,
    }
}

/// Ok(None) when DSH is not set up; a failed refresh keeps the last balance (marked stale by age).
pub(super) async fn read_usage(home: &Path) -> Result<Option<DshUsage>, Problem> {
    let home = home.to_path_buf();
    let located = tauri::async_runtime::spawn_blocking(move || locate(&home)).await.map_err(|_| NETWORK)?;
    let credential = match located {
        Ok(Some(credential)) => credential,
        other => {
            *CACHE.lock().unwrap_or_else(PoisonError::into_inner) = None;
            return other.map(|_| None);
        }
    };
    let fingerprint = credential.fingerprint();
    let now = current_unix_millis();
    {
        let mut cache = CACHE.lock().unwrap_or_else(PoisonError::into_inner);
        if let Some(cached) = cache.as_ref().filter(|c| c.fingerprint == fingerprint) {
            let retry = if cached.problem.is_none() { REFRESH_MS } else { RETRY_MS };
            if now.saturating_sub(cached.attempted_at) < retry { return cached_result(cached); }
        } else {
            *cache = Some(CachedBalance { fingerprint: fingerprint.clone(), attempted_at: now, usage: None, problem: None });
        }
        if let Some(cache) = cache.as_mut() { cache.attempted_at = now; }
    }
    let result = query(&credential).await;
    let mut cache = CACHE.lock().unwrap_or_else(PoisonError::into_inner);
    let Some(cached) = cache.as_mut().filter(|cache| cache.fingerprint == fingerprint) else { return result.map(Some); };
    match result {
        Ok(usage) => { cached.usage = Some(usage); cached.problem = None; }
        Err(problem) => cached.problem = Some(problem),
    }
    cached_result(cached)
}

pub(super) fn cached_result(cached: &CachedBalance) -> Result<Option<DshUsage>, Problem> {
    match (&cached.usage, cached.problem) {
        (Some(usage), _) => Ok(Some(usage.clone())),
        (None, Some(problem)) => Err(problem),
        // The first query is still in flight for another caller.
        (None, None) => Ok(None),
    }
}

#[tauri::command]
/// Err(`dsh:<code>`): DSH is set up but its balance cannot be shown; the code says why.
pub async fn get_dsh_usage() -> Result<Option<DshUsage>, String> {
    let Ok(home) = crate::system::windows_home_dir() else { return Ok(None); };
    read_usage(&home).await.map_err(|problem| format!("dsh:{problem}"))
}

#[cfg(test)]
#[path = "dsh_usage_tests.rs"]
mod tests;
