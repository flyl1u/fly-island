// Protocol parsing adapted from cc-switch (MIT); see THIRD_PARTY_LICENSES/cc-switch.txt.
use super::model::{QuotaTier, TIER_FIVE_HOUR, TIER_MONTHLY, TIER_WEEKLY_LIMIT};
use serde_json::Value;

enum ZhipuWindow {
    FiveHour,
    Weekly,
}

pub fn parse_f64(value: &Value) -> Option<f64> {
    value
        .as_f64()
        .or_else(|| value.as_str().and_then(|s| s.parse().ok()))
        .filter(|n| n.is_finite())
}

pub fn millis_to_iso8601(ms: i64) -> Option<String> {
    chrono::DateTime::from_timestamp_millis(ms).map(|dt| dt.to_rfc3339())
}

pub fn extract_reset_time(value: &Value) -> Option<String> {
    if let Some(s) = value.as_str() {
        return Some(s.to_string());
    }
    let n = value.as_i64().filter(|n| *n > 0)?;
    millis_to_iso8601(if n < 1_000_000_000_000 {
        n.checked_mul(1000)?
    } else {
        n
    })
}

fn classify_zhipu_window(item: &serde_json::Value) -> Option<ZhipuWindow> {
    match item.get("unit").and_then(|v| v.as_i64()) {
        Some(3) => Some(ZhipuWindow::FiveHour),
        Some(6) => Some(ZhipuWindow::Weekly),
        _ => None,
    }
}

pub(super) fn parse_zhipu_token_tiers(data: &serde_json::Value) -> Vec<QuotaTier> {
    type Entry = (Option<i64>, f64, Option<String>);
    let mut five_hour: Option<Entry> = None;
    let mut weekly: Option<Entry> = None;
    let mut unclassified: Vec<Entry> = Vec::new();

    if let Some(limits) = data.get("limits").and_then(|v| v.as_array()) {
        for limit_item in limits {
            let limit_type = limit_item
                .get("type")
                .and_then(|v| v.as_str())
                .unwrap_or("");
            // 大小写不敏感比较：上游若把 "TOKENS_LIMIT" 改成小写或驼峰，依然能识别
            if !(limit_type.eq_ignore_ascii_case("TOKENS_LIMIT")
                || limit_type.eq_ignore_ascii_case("CREDIT_LIMIT"))
            {
                continue;
            }
            let Some(percentage) = limit_item.get("percentage").and_then(parse_f64) else {
                continue;
            };
            let reset_ms = limit_item.get("nextResetTime").and_then(|v| v.as_i64());
            let reset_iso = reset_ms.and_then(millis_to_iso8601);
            let entry = (reset_ms, percentage, reset_iso);
            match classify_zhipu_window(limit_item) {
                Some(ZhipuWindow::FiveHour) if five_hour.is_none() => five_hour = Some(entry),
                Some(ZhipuWindow::Weekly) if weekly.is_none() => weekly = Some(entry),
                _ => unclassified.push(entry),
            }
        }
    }

    unclassified.sort_by_key(|(reset, _, _)| (reset.is_some(), reset.unwrap_or(i64::MIN)));
    for entry in unclassified {
        if five_hour.is_none() {
            five_hour = Some(entry);
        } else if weekly.is_none() {
            weekly = Some(entry);
        }
        // 智谱当前最多两条 TOKENS_LIMIT，多余的忽略
    }

    let mut tiers = Vec::new();
    for (name, slot) in [(TIER_FIVE_HOUR, five_hour), (TIER_WEEKLY_LIMIT, weekly)] {
        if let Some((_, percentage, resets_at)) = slot {
            tiers.push(QuotaTier {
                name: name.to_string(),
                utilization: percentage,
                resets_at,
                used_value_usd: None,
                max_value_usd: None,
            });
        }
    }
    tiers
}

pub(super) fn parse_minimax_tiers(body: &serde_json::Value) -> Vec<QuotaTier> {
    let mut tiers = Vec::new();

    let Some(model_remains) = body.get("model_remains").and_then(|v| v.as_array()) else {
        return tiers;
    };

    // 只取 model_name == "general" 的条目,跳过 video 等非编程模型
    let Some(item) = model_remains.iter().find(|item| {
        item.get("model_name")
            .and_then(|v| v.as_str())
            .map(|s| s == "general")
            .unwrap_or(false)
    }) else {
        return tiers;
    };

    // 5h 桶:剩余百分比 → 已用百分比
    if let Some(remain_pct) = item
        .get("current_interval_remaining_percent")
        .and_then(|v| v.as_f64())
    {
        let resets_at = item
            .get("end_time")
            .and_then(|v| v.as_i64())
            .and_then(millis_to_iso8601);
        tiers.push(QuotaTier {
            name: TIER_FIVE_HOUR.to_string(),
            utilization: 100.0 - remain_pct,
            resets_at,
            used_value_usd: None,
            max_value_usd: None,
        });
    }

    // 周桶:status=1 正常计时;status=2 表示周额度已耗尽(剩余 0%,官方控制台仍
    // 显示该桶并按周限额限流),照常展示成「已用完」;status=3 表示该套餐无周
    // 限额(remaining_percent 恒为 100),跳过
    let weekly_status = item.get("current_weekly_status").and_then(|v| v.as_i64());
    if weekly_status == Some(1) || weekly_status == Some(2) {
        if let Some(remain_pct) = item
            .get("current_weekly_remaining_percent")
            .and_then(|v| v.as_f64())
        {
            let resets_at = item
                .get("weekly_end_time")
                .and_then(|v| v.as_i64())
                .and_then(millis_to_iso8601);
            tiers.push(QuotaTier {
                name: TIER_WEEKLY_LIMIT.to_string(),
                utilization: 100.0 - remain_pct,
                resets_at,
                used_value_usd: None,
                max_value_usd: None,
            });
        }
    }

    tiers
}

pub(super) fn parse_opencode_go_tiers(body: &serde_json::Value) -> Vec<QuotaTier> {
    const WINDOWS: [(&str, &str); 3] = [
        ("rolling", TIER_FIVE_HOUR),
        ("weekly", TIER_WEEKLY_LIMIT),
        ("monthly", TIER_MONTHLY),
    ];
    let Some(usage) = body.get("usage") else {
        return Vec::new();
    };
    let mut tiers = Vec::new();
    for (key, tier_name) in WINDOWS {
        let Some(window) = usage.get(key) else {
            continue;
        };
        let Some(percent) = window.get("percent").and_then(parse_f64) else {
            continue;
        };
        let resets_at = if percent > 0.0 {
            window.get("resetsAt").and_then(extract_reset_time)
        } else {
            None
        };
        tiers.push(QuotaTier {
            name: tier_name.to_string(),
            utilization: percent,
            resets_at,
            used_value_usd: None,
            max_value_usd: None,
        });
    }
    tiers
}

pub(super) fn parse_afp_tiers(result: &serde_json::Value) -> Vec<QuotaTier> {
    let mut tiers = Vec::new();
    for (key, name) in [
        ("AFPFiveHour", TIER_FIVE_HOUR),
        ("AFPWeekly", TIER_WEEKLY_LIMIT),
        ("AFPMonthly", TIER_MONTHLY),
    ] {
        let Some(win) = result.get(key) else { continue };
        let quota = win.get("Quota").and_then(parse_f64).unwrap_or(0.0);
        if quota <= 0.0 {
            continue;
        }
        let Some(used) = win.get("Used").and_then(parse_f64) else {
            continue;
        };
        // 已用百分比；不做范围裁剪，与 parse_zhipu_token_tiers/parse_minimax_tiers
        // 的约定一致（下游渲染层负责显示策略）。
        let utilization = used / quota * 100.0;
        let resets_at = win.get("ResetTime").and_then(extract_reset_time);
        tiers.push(QuotaTier {
            name: name.to_string(),
            utilization,
            resets_at,
            used_value_usd: None,
            max_value_usd: None,
        });
    }
    tiers
}

pub(super) fn volcengine_coding_window(label: &str) -> Option<&'static str> {
    match label.to_lowercase().as_str() {
        "session" | "5h" | "fivehour" | "five_hour" | "rolling_5h" => Some(TIER_FIVE_HOUR),
        "weekly" | "week" | "7d" => Some(TIER_WEEKLY_LIMIT),
        "monthly" | "month" => Some(TIER_MONTHLY),
        _ => None,
    }
}

pub(super) fn parse_coding_plan_tiers(result: &serde_json::Value) -> Vec<QuotaTier> {
    let mut tiers = Vec::new();
    let arr = result
        .get("QuotaUsage")
        .and_then(|v| v.as_array())
        .or_else(|| result.get("Usages").and_then(|v| v.as_array()))
        .or_else(|| result.get("Details").and_then(|v| v.as_array()));
    let Some(arr) = arr else { return tiers };

    for item in arr {
        // 真实字段是 `Level`（实测 2026-06-21：session/weekly/monthly）；其余作防御式 fallback。
        let label = item
            .get("Level")
            .and_then(|v| v.as_str())
            .or_else(|| item.get("Type").and_then(|v| v.as_str()))
            .or_else(|| item.get("Period").and_then(|v| v.as_str()))
            .or_else(|| item.get("Label").and_then(|v| v.as_str()))
            .or_else(|| item.get("Window").and_then(|v| v.as_str()))
            .unwrap_or("");
        let Some(name) = volcengine_coding_window(label) else {
            continue;
        };
        let Some(utilization) = item
            .get("Percent")
            .and_then(parse_f64)
            .or_else(|| item.get("UsedPercent").and_then(parse_f64))
            .or_else(|| item.get("UsagePercent").and_then(parse_f64))
        else {
            continue;
        };
        // 兼容秒/毫秒/字符串（extract_reset_time 内部已区分秒与毫秒）。
        let resets_at = item
            .get("ResetTime")
            .or_else(|| item.get("ResetTimestamp"))
            .and_then(extract_reset_time);
        tiers.push(QuotaTier {
            name: name.to_string(),
            utilization,
            resets_at,
            used_value_usd: None,
            max_value_usd: None,
        });
    }
    tiers
}

pub(super) fn command_code_window_tier(
    window: Option<&serde_json::Value>,
    name: &str,
) -> Option<QuotaTier> {
    let window = window?;
    let used = window.get("used").and_then(parse_f64)?;
    let cap = window.get("cap").and_then(parse_f64)?;
    if cap <= 0.0 {
        return None;
    }
    Some(QuotaTier {
        name: name.to_string(),
        utilization: used / cap * 100.0,
        resets_at: window.get("resetAt").and_then(extract_reset_time),
        used_value_usd: None,
        max_value_usd: None,
    })
}
