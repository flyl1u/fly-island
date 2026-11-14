use super::*;
use crate::api_balance::model::{validate_account, UsageData};
use serde_json::json;

fn account() -> Account {
    serde_json::from_value(json!({
        "id":"alert-test", "name":"Test", "template":"general", "baseUrl":"https://example.com",
        "timeoutSeconds":10, "intervalMinutes":5, "quotaPerUnit":500000, "enabled":true,
        "alertThreshold":5.25, "alertUnit":"USD"
    }))
    .unwrap()
}

fn result(value: Option<f64>, unit: &str) -> QueryResult {
    QueryResult {
        data: vec![UsageData {
            remaining: value,
            unit: Some(unit.into()),
            ..Default::default()
        }],
        ..Default::default()
    }
}

#[test]
fn strictly_below_with_decimals_zero_and_negative_balance() {
    let a = account();
    assert!(evaluate(&a, &result(Some(5.25), "USD"), None, 1).is_none());
    assert!(evaluate(&a, &result(Some(5.26), "USD"), None, 1).is_none());
    for value in [5.2499, 0.0, -1.0] {
        assert_eq!(
            evaluate(&a, &result(Some(value), "USD"), None, 1)
                .unwrap()
                .remaining,
            value
        );
    }
}

#[test]
fn units_invalid_unlimited_unknown_and_tiers_do_not_fabricate_a_warning() {
    let a = account();
    assert!(evaluate(&a, &result(Some(1.0), "CNY"), None, 1).is_none());
    assert!(evaluate(&a, &result(None, "USD"), None, 1).is_none());
    assert!(evaluate(&a, &result(Some(f64::NAN), "USD"), None, 1).is_none());
    assert!(evaluate(&a, &QueryResult::default(), None, 1).is_none());
    for (unlimited, valid) in [(true, None), (false, Some(false))] {
        let mut r = result(Some(0.0), "USD");
        r.data[0].unlimited = unlimited;
        r.data[0].is_valid = valid;
        assert!(evaluate(&a, &r, None, 1).is_none());
    }
    assert!(evaluate(&a, &result(Some(1.0), " usd "), None, 1).is_some());
}

#[test]
fn low_state_deduplicates_until_a_valid_recovery() {
    let a = account();
    let low = evaluate(&a, &result(Some(1.0), "USD"), None, 100).unwrap();
    let still_low = evaluate(&a, &result(Some(0.5), "USD"), Some(&low), 200).unwrap();
    assert_eq!(still_low.triggered_at, 100);
    assert_eq!(still_low.remaining, 0.5);
    let unknown = evaluate(&a, &result(None, "USD"), Some(&low), 300).unwrap();
    assert_eq!(unknown.triggered_at, 100);
    let mut unlimited = result(None, "USD");
    unlimited.data[0].unlimited = true;
    assert!(evaluate(&a, &unlimited, Some(&low), 350).is_none());
    assert!(evaluate(&a, &result(Some(5.25), "USD"), Some(&low), 400).is_none());
    assert_eq!(
        evaluate(&a, &result(Some(1.0), "USD"), None, 500)
            .unwrap()
            .triggered_at,
        500
    );
}

#[test]
fn disabled_and_legacy_accounts_have_no_alerts_and_thresholds_are_validated() {
    let mut a = account();
    a.enabled = false;
    assert!(evaluate(&a, &result(Some(0.0), "USD"), None, 1).is_none());
    let mut legacy = serde_json::to_value(account()).unwrap();
    legacy.as_object_mut().unwrap().remove("alertThreshold");
    legacy.as_object_mut().unwrap().remove("alertUnit");
    let old: Account = serde_json::from_value(legacy).unwrap();
    assert!(old.alert_threshold.is_none());
    assert_eq!(old.alert_unit, "USD");
    assert!(validate_account(&old).is_ok());
    for amount in [f64::NAN, -1.0, f64::INFINITY] {
        a.alert_threshold = Some(amount);
        assert!(validate_account(&a).is_err());
    }
    a.alert_threshold = Some(0.0);
    a.alert_unit = " ".into();
    assert!(validate_account(&a).is_err());
}

#[test]
fn multiple_wallets_compare_only_the_selected_unit_without_adding() {
    let a = account();
    let mut r = result(Some(8.0), "USD");
    r.data.push(result(Some(0.0), "CNY").data.remove(0));
    assert!(evaluate(&a, &r, None, 1).is_none());
    r.data.push(result(Some(2.5), "USD").data.remove(0));
    assert_eq!(evaluate(&a, &r, None, 1).unwrap().remaining, 2.5);
}
