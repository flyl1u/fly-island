//! Antigravity's grouped, explicitly named 5-hour and weekly windows.
use serde_json::Value;
use super::{antigravity_quota_cache::empty, sessions::parse_timestamp_ms, usage::{AgentUsage, UsageWindow}};

pub(super) fn parse(value: &Value, now: i64) -> Option<AgentUsage> {
    let root = value.get("response").unwrap_or(value);
    let mut usage = empty();
    for group in root["groups"].as_array()? {
        for bucket in group["buckets"].as_array().into_iter().flatten() {
            if bucket["disabled"] == true { continue; }
            let id = bucket["bucketId"].as_str().unwrap_or_default();
            let name = bucket["window"].as_str().unwrap_or_default();
            let target = match name {
                "5h" => &mut usage.five_hour,
                "weekly" => &mut usage.seven_day,
                "" if id.ends_with("-5h") => &mut usage.five_hour,
                "" if id.ends_with("-weekly") => &mut usage.seven_day,
                _ => continue,
            };
            let reset = bucket["resetTime"].as_str().and_then(parse_timestamp_ms).filter(|at| *at > 0);
            let remaining = match bucket.get("remainingFraction") {
                Some(value) => value.as_f64().or_else(|| value.as_str()?.parse().ok()),
                // A real reset timestamp distinguishes an exhausted proto3 zero from missing data.
                None if reset.is_some() => Some(0.0),
                None => None,
            };
            let Some(remaining) = remaining.filter(|value| value.is_finite() && (0.0..=1.0).contains(value)) else { continue };
            if reset.is_some_and(|at| at <= now) { continue; }
            let window = UsageWindow { name: String::new(), used: (1.0 - remaining) * 100.0, resets_at: reset };
            // The indicator represents the tightest available pool for each actual time window.
            if target.as_ref().is_none_or(|known| window.used > known.used) { *target = Some(window); }
        }
    }
    if usage.five_hour.is_none() && usage.seven_day.is_none() { return None; }
    usage.updated_at = Some(now);
    Some(usage)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn reads_named_windows_in_any_order_and_uses_the_tightest_enabled_pool() {
        let usage = parse(&json!({"response":{"groups":[
            {"buckets":[{"window":"weekly","remainingFraction":0.8},{"window":"5h","remainingFraction":0.6}]},
            {"buckets":[{"window":"5h","remainingFraction":0.2},{"window":"weekly","remainingFraction":0.1,"disabled":true}]}
        ]}}), 1).unwrap();
        assert_eq!(usage.five_hour.unwrap().used, 80.0);
        assert!((usage.seven_day.unwrap().used - 20.0).abs() < 0.001);
        assert!(usage.models.is_empty());
    }

    #[test]
    fn disabled_and_missing_5h_are_unknown_not_full_or_a_model_quota() {
        let usage = parse(&json!({"groups":[{"buckets":[
            {"bucketId":"gemini-weekly","remainingFraction":0.9174408,"resetTime":"2030-01-01T00:00:00Z"},
            {"window":"5h","remainingFraction":1,"disabled":true}
        ]}]}), 1).unwrap();
        assert!(usage.five_hour.is_none());
        assert!((usage.seven_day.unwrap().used - 8.25592).abs() < 0.001);
        assert!(parse(&json!({"groups":[{"buckets":[{"window":"5h"}]}]}), 1).is_none());
    }

    #[test]
    fn rejects_invalid_values_and_expired_windows_but_keeps_real_zero() {
        for fraction in [json!(-1), json!(2), json!("broken")] {
            assert!(parse(&json!({"groups":[{"buckets":[{"window":"5h","remainingFraction":fraction}]}]}), 1).is_none());
        }
        let exhausted = parse(&json!({"groups":[{"buckets":[{"window":"5h","resetTime":"2030-01-01T00:00:00Z"}]}]}), 1).unwrap();
        assert_eq!(exhausted.five_hour.unwrap().used, 100.0);
        assert!(parse(&json!({"groups":[{"buckets":[{"window":"weekly","remainingFraction":0.5,"resetTime":"2000-01-01T00:00:00Z"}]}]}), 2_000_000_000_000).is_none());
    }
}
