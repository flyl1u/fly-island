use super::*;
use serde_json::json;

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
