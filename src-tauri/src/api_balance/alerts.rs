use super::model::{Account, QueryResult};
use serde::Serialize;

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BalanceWarning {
    pub remaining: f64,
    pub unit: String,
    pub threshold: f64,
    pub triggered_at: i64,
}

/// Called only after a successful query. Failed reads cannot recover or rearm an alert.
pub fn evaluate(
    account: &Account,
    result: &QueryResult,
    previous: Option<&BalanceWarning>,
    now: i64,
) -> Option<BalanceWarning> {
    if !account.enabled {
        return None;
    }
    let threshold = account.alert_threshold?;
    let unit = account.alert_unit.trim();
    let comparable = result.data.iter().any(|row| {
        row.is_valid != Some(false)
            && (row.unlimited || row.remaining.is_some_and(f64::is_finite))
            && row
                .unit
                .as_deref()
                .is_some_and(|u| u.trim().eq_ignore_ascii_case(unit))
    });
    if !comparable {
        return previous.cloned();
    }
    let remaining = result
        .data
        .iter()
        .filter_map(|row| {
            if row.unlimited
                || row.is_valid == Some(false)
                || !row
                    .unit
                    .as_deref()
                    .is_some_and(|u| u.trim().eq_ignore_ascii_case(unit))
            {
                return None;
            }
            row.remaining.filter(|n| n.is_finite() && *n < threshold)
        })
        .min_by(f64::total_cmp)?;
    let triggered_at = previous
        .filter(|old| old.threshold == threshold && old.unit.eq_ignore_ascii_case(unit))
        .map_or(now, |old| old.triggered_at);
    Some(BalanceWarning {
        remaining,
        unit: unit.into(),
        threshold,
        triggered_at,
    })
}

#[cfg(test)]
#[path = "alert_tests.rs"]
mod tests;
