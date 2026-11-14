use super::*;
use serde_json::json;
use std::fs;

#[test]
fn reads_api_wallets_without_inventing_a_percentage() {
    let value = json!({"is_available": true, "balance_infos": [{"currency":"CNY", "total_balance":"12.3456", "granted_balance":"2.3456", "topped_up_balance":"10.00"}]});
    let usage = parse_api(&value, 1234).unwrap();
    assert_eq!(usage.wallets[0].total, "12.3456");
    assert!(usage.available);
    assert_eq!(usage.source, "dshApi");
    assert_eq!(usage.updated_at, 1234);
    assert!(parse_api(&json!({"is_available":true,"balance_infos":[]}), 0).is_none());
    assert!(parse_api(&json!({"error":"unavailable"}), 0).is_none());
}

#[test]
fn reads_account_bonus_separately_and_preserves_currency() {
    let value = json!({"code":0,"data":{"biz_code":0,"biz_data":{
        "normal_wallets":[{"currency":"CNY","balance":"10"}],
        "bonus_wallets":[{"currency":"CNY","balance":"2.5"},{"currency":"USD","balance":"1e-2"}]
    }}});
    let usage = parse_account(&value, 0).unwrap();
    assert_eq!(usage.wallets.len(), 2);
    assert_eq!(usage.wallets[0].total, "12.5");
    assert_eq!(usage.wallets[1].total, "0.01");
    assert!(usage.available);
    let mut bad = value.clone();
    bad["data"]["biz_code"] = json!(40003);
    assert!(parse_account(&bad, 0).is_none());
    bad = value;
    bad["data"]["biz_data"]["bonus_wallets"][0]["balance"] = json!("NaN");
    assert!(parse_account(&bad, 0).is_none());
}

#[test]
fn exhausted_and_failed_are_distinct() {
    let value = json!({"is_available":false,"balance_infos":[{"currency":"USD","total_balance":"-0.01","granted_balance":"0","topped_up_balance":"-0.01"}]});
    assert!(!parse_api(&value, 0).unwrap().available);
    let mut bad = value;
    bad["balance_infos"][0]["total_balance"] = json!("Infinity");
    assert!(parse_api(&bad, 0).is_none());
}

#[test]
fn account_wallet_addition_keeps_decimal_precision() {
    assert_eq!(wallet_total("0.1", "0.2").as_deref(), Some("0.3"));
    assert_eq!(wallet_total("0E-16", ".5").as_deref(), Some("0.5"));
    assert_eq!(wallet_total("1e+3", "-0.001").as_deref(), Some("999.999"));
    assert_eq!(wallet_total("-1.00", "1").as_deref(), Some("0"));
    assert!(wallet_total("1e+99", "1").is_none());
}

fn store(name: &str, provider: &str, modified_offset: u64, credentials: Option<&str>) -> std::path::PathBuf {
    let root = std::env::temp_dir().join(format!("focusd-dsh-store-{}-{name}", std::process::id()));
    let _ = fs::remove_dir_all(&root);
    let dir = root.join("storages/session_projcache/sessions");
    fs::create_dir_all(&dir).unwrap();
    let checkpoint = json!({"version":7,"record":{"rows":{"modelSelection":{"ver":2,"val":{"lastUsed":{"provider":provider}}}}}});
    let path = dir.join("session-x.json");
    fs::write(&path, checkpoint.to_string()).unwrap();
    let time = std::time::SystemTime::UNIX_EPOCH + std::time::Duration::from_secs(1_700_000_000 + modified_offset);
    fs::File::options().write(true).open(&path).unwrap().set_modified(time).unwrap();
    if let Some(text) = credentials { fs::write(root.join(".credentials.yaml"), text).unwrap(); }
    root
}

#[test]
fn balance_follows_the_store_in_use_and_says_why_it_cannot() {
    let key = "version: 1
refs:
  DEEPSEEK_API_KEY: fictional-key
";
    // The older store has a key, the newer one (in use) has none: say so, don't borrow the old key.
    let old = store("old", "deepseek-official", 0, Some(key));
    let new = store("new", "deepseek-official", 100, None);
    assert_eq!(locate_in(vec![old.clone(), new.clone()]).err(), Some(NO_CREDENTIAL));
    fs::write(new.join(".credentials.yaml"), key).unwrap();
    assert!(matches!(locate_in(vec![old.clone(), new.clone()]), Ok(Some(Credential::ApiKey(_)))));
    let custom = store("custom", "openrouter", 200, Some(key));
    assert_eq!(locate_in(vec![old.clone(), new.clone(), custom.clone()]).err(), Some(CUSTOM_PROVIDER));
    fs::write(new.join("settings.yaml"), "baseURL: https://example.invalid
").unwrap();
    assert_eq!(locate_in(vec![new.clone()]).err(), Some(CUSTOM_ROUTE));
    assert!(matches!(locate_in(Vec::new()), Ok(None)));
    let empty = std::env::temp_dir().join(format!("focusd-dsh-store-{}-empty", std::process::id()));
    fs::create_dir_all(empty.join("storages/session_projcache/sessions")).unwrap();
    assert_eq!(locate_in(vec![empty.clone()]).err(), Some(NO_SESSION));
    for root in [old, new, custom, empty] { let _ = fs::remove_dir_all(root); }
}

#[test]
fn failed_refresh_keeps_last_balance_else_reports_reason() {
    let usage = parse_api(&json!({"is_available": true, "balance_infos": [{"currency":"CNY", "total_balance":"1", "granted_balance":"0", "topped_up_balance":"1"}]}), 1).unwrap();
    let mut cached = CachedBalance { fingerprint: String::new(), attempted_at: 0, usage: None, problem: Some("timeout") };
    assert_eq!(cached_result(&cached), Err("timeout"));
    cached.usage = Some(usage.clone());
    assert_eq!(cached_result(&cached), Ok(Some(usage)));
    cached.usage = None;
    cached.problem = None;
    assert_eq!(cached_result(&cached), Ok(None));
}
