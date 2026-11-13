//! Read-only credit summary from WorkBuddy's personal Plans & Usage page.

use reqwest::{header, redirect::Policy, StatusCode, Url};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::time::Duration;

use super::snapshot::current_unix_millis;

pub(super) const USAGE_PAGE: &str = "https://www.workbuddy.cn/profile/plans-usage";
pub(super) const SUMMARY_URL: &str =
    "https://www.workbuddy.cn/billing/meter/get-user-resource-summary";
const MAX_RESPONSE_BYTES: usize = 512 * 1024;

#[derive(Clone, Copy, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct WorkbuddyUsage {
    pub(super) remaining: f64,
    pub(super) total: f64,
    updated_at: i64,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(super) enum ReadError {
    LoginRequired,
    Unavailable,
}

#[derive(Deserialize)]
struct Summary {
    code: i64,
    data: Option<SummaryData>,
}

#[derive(Deserialize)]
#[serde(rename_all = "PascalCase")]
struct SummaryData {
    packages: Vec<Package>,
}

#[derive(Deserialize)]
#[serde(rename_all = "PascalCase")]
struct Package {
    capacity_unit: String,
    cycle_total_capacity: Option<Value>,
    cycle_remain_capacity: Option<Value>,
}

fn amount(value: Option<Value>) -> Option<f64> {
    let value = match value? {
        Value::Number(value) => value.as_f64()?,
        Value::String(value) => value.parse().ok()?,
        _ => return None,
    };
    (value.is_finite() && value >= 0.0).then_some(value)
}

fn parse_summary(body: &[u8], now: i64) -> Option<WorkbuddyUsage> {
    let summary: Summary = serde_json::from_slice(body).ok()?;
    if summary.code != 0 {
        return None;
    }
    let mut total = 0.0;
    let mut remaining = 0.0;
    let mut has_credits = false;
    // The summary already includes bonus and reward packages. CreditGroups describes the same credits.
    for package in summary.data?.packages {
        if package.capacity_unit != "credits" {
            continue;
        }
        has_credits = true;
        total += amount(package.cycle_total_capacity)?;
        remaining += amount(package.cycle_remain_capacity)?;
    }
    (has_credits && total.is_finite() && remaining.is_finite()).then_some(WorkbuddyUsage {
        total,
        remaining,
        updated_at: now,
    })
}

pub(super) async fn query(
    url: Url,
    mut cookie: header::HeaderValue,
    user_agent: &str,
) -> Result<WorkbuddyUsage, ReadError> {
    cookie.set_sensitive(true);
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(8))
        .redirect(Policy::none())
        .build()
        .map_err(|_| ReadError::Unavailable)?;
    let mut response = client
        .post(url)
        .header(header::ACCEPT, "application/json")
        .header(header::USER_AGENT, user_agent)
        .header(header::ORIGIN, "https://www.workbuddy.cn")
        .header(header::REFERER, USAGE_PAGE)
        .header(header::COOKIE, cookie)
        .header(header::CONTENT_TYPE, "application/json")
        .body("{}")
        .send()
        .await
        .map_err(|_| ReadError::Unavailable)?;
    match response.status() {
        StatusCode::OK => {}
        StatusCode::UNAUTHORIZED => return Err(ReadError::LoginRequired),
        _ => return Err(ReadError::Unavailable),
    }
    if response
        .content_length()
        .is_some_and(|size| size > MAX_RESPONSE_BYTES as u64)
    {
        return Err(ReadError::Unavailable);
    }
    let mut body = Vec::new();
    while let Some(chunk) = response.chunk().await.map_err(|_| ReadError::Unavailable)? {
        if body.len() + chunk.len() > MAX_RESPONSE_BYTES {
            return Err(ReadError::Unavailable);
        }
        body.extend_from_slice(&chunk);
    }
    parse_summary(&body, current_unix_millis()).ok_or(ReadError::Unavailable)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn summarizes_only_credits_and_does_not_count_reward_groups_twice() {
        let body = br#"{"code":0,"data":{"Packages":[
          {"CapacityUnit":"credits","CycleTotalCapacity":"500","CycleRemainCapacity":"10.25"},
          {"CapacityUnit":"credits","CycleTotalCapacity":50,"CycleRemainCapacity":"49.5"},
          {"CapacityUnit":"tokens","CycleTotalCapacity":"10000","CycleRemainCapacity":"1000"}
        ],"CreditGroups":[{"Kind":"benefit","CycleRemainCapacity":"49.5"}]}}"#;
        let usage = parse_summary(body, 123).unwrap();
        assert_eq!(
            (usage.total, usage.remaining, usage.updated_at),
            (550.0, 59.75, 123)
        );
    }

    #[test]
    fn distinguishes_exhaustion_from_missing_or_invalid_data() {
        let zero = br#"{"code":0,"data":{"Packages":[{"CapacityUnit":"credits","CycleTotalCapacity":"100","CycleRemainCapacity":"0"}]}}"#;
        assert_eq!(parse_summary(zero, 0).unwrap().remaining, 0.0);
        let no_packages = br#"{"code":0,"data":{"Packages":[]}}"#;
        assert_eq!(parse_summary(no_packages, 0), None);
        let bad_amount = br#"{"code":0,"data":{"Packages":[{"CapacityUnit":"credits","CycleTotalCapacity":"100","CycleRemainCapacity":"NaN"}]}}"#;
        assert_eq!(parse_summary(bad_amount, 0), None);
        assert_eq!(parse_summary(br#"{"code":400,"data":null}"#, 0), None);
    }
}
