//! Third-party relay accounts (New API, Sub2API, custom endpoints) for the quota ring.
//! The whole config, including secrets, lives in Windows Credential Manager in chunks;
//! only masked views cross the IPC boundary.

use keyring::{Entry, Error as KeyringError};
use ring::digest;
use serde::{Deserialize, Serialize};

use crate::legacy_migration;

const SERVICE: &str = "com.flyisland.app.relay-accounts";
static ACCOUNTS: std::sync::Mutex<()> = std::sync::Mutex::new(());
static GENERATION: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);
fn account_lock() -> Result<std::sync::MutexGuard<'static, ()>, String> {
    ACCOUNTS.lock().map_err(|_| STORAGE_ERROR.to_string())
}
const STORAGE_ERROR: &str = "relay:storage";
const MASK: &str = "····";

pub(super) const ADAPTERS: [&str; 4] = ["newapi-account", "newapi-token", "sub2api", "custom"];

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RelayAccount {
    pub(super) id: String,
    pub(super) name: String,
    pub(super) adapter: String,
    pub(super) base_url: String,
    #[serde(default)]
    pub(super) access_token: Option<String>,
    #[serde(default)]
    pub(super) refresh_token: Option<String>,
    #[serde(default)]
    pub(super) api_key: Option<String>,
    #[serde(default)]
    pub(super) user_id: Option<String>,
    #[serde(default)]
    pub(super) endpoint_path: Option<String>,
    #[serde(default)]
    pub(super) remaining_path: Option<String>,
    #[serde(default)]
    pub(super) used_path: Option<String>,
    #[serde(default)]
    pub(super) total_path: Option<String>,
    #[serde(default)]
    pub(super) auth_mode: Option<String>,
    #[serde(default)]
    pub(super) currency: Option<String>,
    #[serde(default)]
    pub(super) divisor: Option<f64>,
}

impl RelayAccount {
    /// The credential actually used to authenticate, for masking in settings.
    pub(super) fn secret(&self) -> Option<&str> {
        match self.adapter.as_str() {
            "newapi-account" | "sub2api" => self.access_token.as_deref(),
            _ => self.api_key.as_deref(),
        }
    }
}

/// Settings never receive a token or key, only a masked hint that one is saved.
#[derive(Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RelayAccountView {
    id: String,
    name: String,
    adapter: String,
    base_url: String,
    user_id: Option<String>,
    has_access_token: bool,
    has_refresh_token: bool,
    has_api_key: bool,
    masked_credential: Option<String>,
    endpoint_path: Option<String>,
    remaining_path: Option<String>,
    used_path: Option<String>,
    total_path: Option<String>,
    auth_mode: Option<String>,
    currency: Option<String>,
    divisor: Option<f64>,
}


fn mask(secret: &str) -> String {
    match secret.char_indices().rev().nth(4) {
        Some((index, preceding)) => format!("{MASK}{}", &secret[index + preceding.len_utf8()..]),
        None => MASK.to_string(),
    }
}

fn view(account: &RelayAccount) -> RelayAccountView {
    RelayAccountView {
        id: account.id.clone(),
        name: account.name.clone(),
        adapter: account.adapter.clone(),
        base_url: account.base_url.clone(),
        user_id: account.user_id.clone(),
        has_access_token: account.access_token.is_some(),
        has_refresh_token: account.refresh_token.is_some(),
        has_api_key: account.api_key.is_some(),
        masked_credential: account.secret().map(mask),
        endpoint_path: account.endpoint_path.clone(),
        remaining_path: account.remaining_path.clone(),
        used_path: account.used_path.clone(),
        total_path: account.total_path.clone(),
        auth_mode: account.auth_mode.clone(),
        currency: account.currency.clone(),
        divisor: account.divisor,
    }
}

fn views(accounts: &[RelayAccount]) -> Vec<RelayAccountView> {
    accounts.iter().map(view).collect()
}

fn read_part(name: &str) -> Result<Option<Vec<u8>>, String> {
    match legacy_migration::read_secret_bytes_with_fallback(SERVICE, name) {
        Ok(bytes) => Ok(bytes),
        Err(KeyringError::NoEntry) => Ok(None),
        Err(_) => Err(STORAGE_ERROR.to_string()),
    }
}

fn write_part(name: &str, bytes: &[u8]) -> Result<(), String> {
    Entry::new(SERVICE, name)
        .and_then(|entry| entry.set_secret(bytes))
        .map_err(|_| STORAGE_ERROR.to_string())
}

fn delete_part(name: &str) {
    let _ = legacy_migration::delete_credential_with_fallback(SERVICE, name);
}

struct WindowsCredentials;
impl super::relay_credential_store::Credentials for WindowsCredentials {
    fn read(&self, name: &str) -> Result<Option<Vec<u8>>, String> { read_part(name) }
    fn write(&self, name: &str, bytes: &[u8]) -> Result<(), String> { write_part(name, bytes) }
    fn delete(&self, name: &str) { delete_part(name); }
}
fn load_unlocked() -> Result<Vec<RelayAccount>, String> {
    let Some(bytes) = super::relay_credential_store::load(&WindowsCredentials)? else { return Ok(Vec::new()) };
    serde_json::from_slice(&bytes).map_err(|_| STORAGE_ERROR.to_string())
}
pub(super) fn load() -> Result<Vec<RelayAccount>, String> {
    let _guard = account_lock()?;
    load_unlocked()
}
fn store(accounts: &[RelayAccount]) -> Result<(), String> {
    let bytes = serde_json::to_vec(accounts).map_err(|_| STORAGE_ERROR.to_string())?;
    let sequence = GENERATION.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
    let generation = format!("{}-{sequence}", super::snapshot::current_unix_millis());
    super::relay_credential_store::store(&WindowsCredentials, &bytes, generation)
}

fn normalize(value: &str, limit: usize) -> String {
    value.trim().chars().take(limit).collect()
}

fn valid_url(value: &str) -> bool {
    (value.starts_with("http://") || value.starts_with("https://"))
        && value.len() <= 512
        && !value.chars().any(|c| c.is_control())
}

fn valid_path(value: &str) -> bool {
    value.starts_with('/')
        && value.len() <= 256
        && !value.chars().any(|c| c.is_control() || c.is_whitespace())
}

fn valid_json_path(value: &str) -> bool {
    !value.is_empty()
        && value.len() <= 128
        && value.split('.').all(|part| {
            !part.is_empty() && part.chars().all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '-')
        })
}

fn kept(provided: Option<String>, previous: Option<String>) -> Option<String> {
    match provided {
        None => previous,
        Some(value) if value.trim().is_empty() => None,
        Some(value) => Some(normalize(&value, 4096)),
    }
}

fn new_id(name: &str) -> String {
    let seed = format!("{name}:{}", super::snapshot::current_unix_millis());
    let hash = digest::digest(&digest::SHA256, seed.as_bytes());
    hash.as_ref().iter().take(8).map(|byte| format!("{byte:02x}")).collect()
}

/// `None` in a secret field means "keep the stored one"; an explicit empty string clears it.
pub(super) fn merge(input: RelayAccount, accounts: &[RelayAccount]) -> Result<RelayAccount, String> {
    let previous = accounts.iter().find(|account| account.id == input.id);
    let adapter = normalize(&input.adapter, 32);
    if !ADAPTERS.contains(&adapter.as_str()) {
        return Err("relay:account:adapter".to_string());
    }
    let name = normalize(&input.name, 64);
    if name.is_empty() {
        return Err("relay:account:name".to_string());
    }
    let base_url = normalize(&input.base_url, 512).trim_end_matches('/').to_string();
    if !valid_url(&base_url) {
        return Err("relay:account:url".to_string());
    }
    let endpoint_path = match adapter.as_str() {
        "custom" => {
            let path = input.endpoint_path.as_deref().unwrap_or("/user/balance");
            if !valid_path(path) { return Err("relay:account:path".to_string()); }
            Some(path.to_string())
        }
        _ => None,
    };
    let remaining_path = if adapter == "custom" {
        let path = input.remaining_path.as_deref().unwrap_or("");
        if !valid_json_path(path) { return Err("relay:account:jsonPath".to_string()); }
        Some(path.to_string())
    } else { None };
    let json_path = |value: Option<String>| -> Result<Option<String>, String> {
        let Some(value) = value else { return Ok(None) };
        let value = value.trim();
        if value.is_empty() { return Ok(None) }
        if !valid_json_path(value) { return Err("relay:account:jsonPath".to_string()) }
        Ok(Some(value.to_string()))
    };
    let used_path = if adapter == "custom" { json_path(input.used_path)? } else { None };
    let total_path = if adapter == "custom" { json_path(input.total_path)? } else { None };
    let auth_mode = if adapter == "custom" {
        let mode = input.auth_mode.as_deref().unwrap_or("bearer");
        if !matches!(mode, "bearer" | "x-api-key") { return Err("relay:account:auth".to_string()) }
        Some(mode.to_string())
    } else { None };
    let currency = if adapter == "custom" {
        let code = normalize(input.currency.as_deref().unwrap_or("USD"), 8).to_uppercase();
        if !code.chars().all(|c| c.is_ascii_uppercase()) { return Err("relay:account:currency".to_string()) }
        Some(code)
    } else { None };
    let divisor = if adapter == "custom" {
        let divisor = input.divisor.unwrap_or(1.0);
        if !divisor.is_finite() || divisor <= 0.0 { return Err("relay:account:divisor".to_string()) }
        Some(divisor)
    } else { None };
    Ok(RelayAccount {
        id: if input.id.is_empty() { new_id(&name) } else { normalize(&input.id, 64) },
        name,
        adapter,
        base_url,
        access_token: kept(input.access_token, previous.and_then(|p| p.access_token.clone())),
        refresh_token: kept(input.refresh_token, previous.and_then(|p| p.refresh_token.clone())),
        api_key: kept(input.api_key, previous.and_then(|p| p.api_key.clone())),
        user_id: input.user_id.map(|value| normalize(&value, 128)).filter(|value| !value.is_empty()),
        endpoint_path,
        remaining_path,
        used_path,
        total_path,
        auth_mode,
        currency,
        divisor,
    })
}

/// Used by Sub2API when a refresh rotates a single-use token. Only a matching pair is replaced,
/// so a rotation cannot overwrite credentials the user just changed in settings.
pub(super) fn rotate_tokens(id: &str, previous_access: &str, previous_refresh: &str, access: &str, refresh: &str) -> Result<(), String> {
    let _guard = account_lock()?;
    let mut accounts = load_unlocked()?;
    let Some(account) = accounts.iter_mut().find(|account| account.id == id) else {
        return Ok(());
    };
    if account.access_token.as_deref() != Some(previous_access)
        || account.refresh_token.as_deref() != Some(previous_refresh)
    {
        return Ok(());
    }
    account.access_token = Some(access.to_string());
    account.refresh_token = Some(refresh.to_string());
    store(&accounts)
}

#[tauri::command]
pub fn get_relay_accounts() -> Result<Vec<RelayAccountView>, String> {
    Ok(views(&load()?))
}

#[tauri::command]
pub async fn save_relay_account(input: RelayAccount) -> Result<Vec<RelayAccountView>, String> {
    let _refresh = super::relay_usage::refresh_lock().await;
    let accounts = load()?;
    let mut account = merge(input, &accounts)?;
    let previous = accounts.iter().find(|stored| stored.id == account.id).cloned();
    super::relay_usage::probe(&mut account).await?;
    let _guard = account_lock()?;
    let mut accounts = load_unlocked()?;
    if accounts.iter().find(|stored| stored.id == account.id) != previous.as_ref() {
        return Err("relay:account:changed".into());
    }
    accounts.retain(|existing| existing.id != account.id);
    accounts.push(account);
    store(&accounts)?;
    super::relay_usage::invalidate_cache();
    Ok(views(&accounts))
}

#[tauri::command]
pub fn delete_relay_account(id: String) -> Result<Vec<RelayAccountView>, String> {
    let _guard = account_lock()?;
    let mut accounts = load_unlocked()?;
    accounts.retain(|account| account.id != id);
    store(&accounts)?;
    super::relay_usage::invalidate_cache();
    Ok(views(&accounts))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn input(adapter: &str, secret: Option<String>) -> RelayAccount {
        RelayAccount {
            id: String::new(),
            name: "测试账号".to_string(),
            adapter: adapter.to_string(),
            base_url: "https://relay.example.com/".to_string(),
            access_token: if adapter == "newapi-account" || adapter == "sub2api" { secret.clone() } else { None },
            refresh_token: None,
            api_key: if adapter == "newapi-token" || adapter == "custom" { secret } else { None },
            user_id: None,
            endpoint_path: None,
            remaining_path: None,
            used_path: None,
            total_path: None,
            auth_mode: None,
            currency: None,
            divisor: None,
        }
    }

    #[test]
    fn custom_defaults_are_normalized() {
        let mut draft = input("custom", Some("sk-test".to_string()));
        draft.remaining_path = Some("data.balance".to_string());
        let account = merge(draft, &[]).unwrap();
        assert_eq!(account.endpoint_path.as_deref(), Some("/user/balance"));
        assert_eq!(account.auth_mode.as_deref(), Some("bearer"));
        assert_eq!(account.currency.as_deref(), Some("USD"));
        assert_eq!(account.divisor, Some(1.0));
        assert_eq!(account.base_url, "https://relay.example.com");
    }

    #[test]
    fn absent_secret_keeps_the_old_one_and_empty_clears_it() {
        let saved = merge(input("newapi-account", Some("first".to_string())), &[]).unwrap();
        let mut without = input("newapi-account", None);
        without.id = saved.id.clone();
        assert_eq!(merge(without, std::slice::from_ref(&saved)).unwrap().access_token.as_deref(), Some("first"));
        let mut cleared = input("newapi-account", Some(String::new()));
        cleared.id = saved.id.clone();
        assert_eq!(merge(cleared, &[saved]).unwrap().access_token, None);
    }

    #[test]
    fn view_never_exposes_the_secret() {
        let account = merge(input("newapi-token", Some("sk-1234567890".to_string())), &[]).unwrap();
        let json = serde_json::to_value(view(&account)).unwrap();
        assert!(json.to_string().contains("····7890"));
        assert!(!json.to_string().contains("sk-1234567890"));
        assert_eq!(json["hasApiKey"], true);
    }

    #[test]
    fn edit_view_retains_the_new_api_user_id() {
        let mut draft = input("newapi-account", Some("secret".into()));
        draft.user_id = Some("123".into());
        let saved = merge(draft, &[]).unwrap();
        assert_eq!(serde_json::to_value(view(&saved)).unwrap()["userId"], "123");
    }

    #[test]
    fn rejects_unknown_adapter_and_bad_json_path() {
        assert!(merge(input("unknown", None), &[]).is_err());
        let mut bad = input("custom", Some("sk-test".to_string()));
        bad.remaining_path = Some("data..balance".to_string());
        assert!(merge(bad, &[]).is_err());
    }
}
