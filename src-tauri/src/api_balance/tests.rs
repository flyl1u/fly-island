use super::{http, model::*, plan_parsers::*, providers::*};
use serde_json::json;

#[test]
fn newapi_conversion_and_missing_fields() {
    let r = parse_basic(
        "newapi",
        &json!({"success":true,"data":{"quota":1000000,"used_quota":500000,"group":"vip"}}),
        500000.0,
    )
    .unwrap();
    assert_eq!(r.data[0].remaining, Some(2.0));
    assert_eq!(r.data[0].total, Some(3.0));
    assert!(
        validate_result(parse_basic("newapi", &json!({"data":{}}), 500000.0).unwrap()).is_err()
    );
    assert!(parse_basic("newapi", &json!({"success":false}), 500000.0).is_err());
}

#[test]
fn sub2api_unlimited_and_zero_are_distinct() {
    let r = parse_basic("sub2api", &json!({"remaining":-1,"quota":{"limit":0}}), 1.0).unwrap();
    assert!(r.data[0].unlimited);
    assert_eq!(r.data[0].remaining, None);
    let r = parse_basic("sub2api", &json!({"remaining":0}), 1.0).unwrap();
    assert!(!r.data[0].unlimited);
    assert_eq!(r.data[0].remaining, Some(0.0));
}

#[test]
fn official_wallets_and_units() {
    let r = parse_official(
        "deepseek",
        &json!({"balance_infos":[{"total_balance":"4.25","currency":"CNY"}]}),
        "CNY",
    )
    .unwrap();
    assert_eq!(r.data[0].remaining, Some(4.25));
    let r = parse_official(
        "openrouter",
        &json!({"data":{"total_credits":10,"total_usage":12}}),
        "USD",
    )
    .unwrap();
    assert_eq!(r.data[0].remaining, Some(-2.0));
    let r = parse_official("novita", &json!({"availableBalance":12345}), "USD").unwrap();
    assert_eq!(r.data[0].remaining, Some(1.2345));
    let r = parse_official("siliconflow", &json!({"data":{"totalBalance":"0"}}), "CNY").unwrap();
    assert_eq!(r.data[0].remaining, Some(0.0));
    assert!(validate_result(parse_official("stepfun", &json!({}), "CNY").unwrap()).is_err());
}

#[test]
fn all_token_plan_parsers() {
    let kimi=parse_plan("kimi",&json!({"limits":[{"detail":{"limit":100,"remaining":75,"resetTime":1700000000}}],"usage":{"limit":1000,"remaining":900}})).unwrap();
    assert_eq!(kimi.tiers.len(), 2);
    assert_eq!(kimi.tiers[0].utilization, 25.0);
    for provider in ["zhipu", "zhipu_team"] {
        let r=parse_plan(provider,&json!({"success":true,"data":{"level":"pro","limits":[{"type":"TOKENS_LIMIT","unit":6,"percentage":80},{"type":"TOKENS_LIMIT","unit":3,"percentage":30}]}})).unwrap();
        assert_eq!(r.tiers[0].name, "five_hour");
        assert_eq!(r.tiers[0].utilization, 30.0);
        assert_eq!(r.tiers[1].utilization, 80.0);
    }
    let r=parse_plan("minimax",&json!({"model_remains":[{"model_name":"general","current_interval_remaining_percent":75,"current_weekly_status":2,"current_weekly_remaining_percent":0}]})).unwrap();
    assert_eq!(r.tiers.len(), 2);
    assert_eq!(r.tiers[0].utilization, 25.0);
    assert_eq!(r.tiers[1].utilization, 100.0);
    let r=parse_plan("zenmux",&json!({"success":true,"data":{"quota_5_hour":{"usage_percentage":0.25,"used_value_usd":1,"max_value_usd":4}}})).unwrap();
    assert_eq!(r.tiers[0].utilization, 25.0);
    let r=parse_plan("opencode_go",&json!({"usage":{"rolling":{"percent":50,"resetsAt":1700000000},"weekly":{"percent":10},"monthly":{"percent":2}}})).unwrap();
    assert_eq!(r.tiers.len(), 3);
    let r=parse_command(&json!({"credits":{"monthlyCredits":5,"purchasedCredits":2,"freeCredits":3},"windowLimits":{"limited":true,"fiveHour":{"used":1,"cap":4}}}),&json!({"data":{"planId":"pro"}}),&json!({"totalCost":10})).unwrap();
    assert_eq!(r.data[0].remaining, Some(10.0));
    assert_eq!(r.tiers[0].utilization, 25.0);
    let tiers = parse_afp_tiers(&json!({"AFPFiveHour":{"Quota":100,"Used":25}}));
    assert_eq!(tiers[0].utilization, 25.0);
    let tiers = parse_coding_plan_tiers(&json!({"QuotaUsage":[{"Level":"session","Percent":30}]}));
    assert_eq!(tiers[0].utilization, 30.0);
}

#[test]
fn url_checks_and_errors_do_not_expose_keys() {
    assert!(http::validate_url("https://api.example.com/v1").is_ok());
    assert!(http::validate_url("http://127.0.0.1:3456").is_ok());
    for value in [
        "file:///a",
        "http://example.com",
        "https://key@example.com",
        "javascript:alert(1)",
    ] {
        assert!(http::validate_url(value).is_err());
    }
    assert_eq!(
        http::host("https://api.deepseek.com.evil.test/v1").unwrap(),
        "api.deepseek.com.evil.test"
    );
    let s = Secrets {
        api_key: "fake-secret".into(),
        ..Default::default()
    };
    assert!(!http::redact("error fake-secret", &s).contains("fake-secret"));
}

#[test]
fn missing_plan_fields_never_become_zero_and_fallback_is_explicit() {
    assert!(parse_afp_tiers(&json!({"AFPFiveHour":{"Quota":100}})).is_empty());
    assert!(parse_coding_plan_tiers(&json!({"QuotaUsage":[{"Level":"session"}]})).is_empty());
    assert!(zhipu_has_no_plan(
        &json!({"success":false,"msg":"当前用户不存在coding plan"})
    ));
    assert!(!zhipu_has_no_plan(
        &json!({"success":false,"msg":"coding plan authentication failed"})
    ));
    assert_eq!(
        parse_basic("sub2api", &json!({"remaining":-2}), 1.0)
            .unwrap()
            .data[0]
            .remaining,
        Some(-2.0)
    );
}
