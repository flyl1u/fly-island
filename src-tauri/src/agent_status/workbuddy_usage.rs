//! Read-only credit summary from WorkBuddy's personal Plans & Usage page.

use reqwest::{header, redirect::Policy, StatusCode, Url};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::time::Duration;

use super::{snapshot::current_unix_millis, workbuddy_auth::AuthError};

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

impl WorkbuddyUsage {
    pub(super) fn new(remaining: f64, total: f64, updated_at: i64) -> Self {
        Self { remaining, total, updated_at }
    }

    #[cfg(test)]
    pub(super) fn total(&self) -> f64 { self.total }

    #[cfg(test)]
    pub(super) fn remaining(&self) -> f64 { self.remaining }
}

#[derive(Deserialize)]
struct Summary {
    code: Option<i64>,
    error: Option<String>,
    data: Option<SummaryData>,
}

#[derive(Deserialize)]
#[serde(rename_all = "PascalCase")]
struct SummaryData {
    packages: Option<Vec<Package>>,
    #[serde(rename = "msg")]
    message: Option<String>,
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

fn parse_summary(body: &[u8], now: i64) -> Result<WorkbuddyUsage, AuthError> {
    let summary: Summary = serde_json::from_slice(body).map_err(|_| AuthError::InvalidResponse)?;
    if summary.error.as_deref() == Some("invalid_token")
        || summary
            .data
            .as_ref()
            .and_then(|data| data.message.as_deref())
            == Some("登录态已失效，请重新登录")
    {
        return Err(AuthError::NotLoggedIn);
    }
    if summary.code != Some(0) {
        return Err(AuthError::InvalidResponse);
    }
    let packages = summary
        .data
        .and_then(|data| data.packages)
        .ok_or(AuthError::InvalidResponse)?;
    let mut total = 0.0;
    let mut remaining = 0.0;
    let mut has_credits = false;
    // The summary already includes bonus and reward packages. CreditGroups describes the same credits.
    for package in packages {
        if package.capacity_unit != "credits" {
            continue;
        }
        has_credits = true;
        total += amount(package.cycle_total_capacity).ok_or(AuthError::InvalidResponse)?;
        remaining += amount(package.cycle_remain_capacity).ok_or(AuthError::InvalidResponse)?;
    }
    (has_credits && total.is_finite() && remaining.is_finite())
        .then_some(WorkbuddyUsage {
            total,
            remaining,
            updated_at: now,
        })
        .ok_or(AuthError::InvalidResponse)
}

fn status_result(status: StatusCode) -> Result<(), AuthError> {
    match status {
        StatusCode::OK => Ok(()),
        StatusCode::UNAUTHORIZED => Err(AuthError::Unauthorized),
        StatusCode::FORBIDDEN => Err(AuthError::Forbidden),
        status => Err(AuthError::HttpStatus(status.as_u16())),
    }
}

fn transport_error(error: reqwest::Error) -> AuthError {
    if error.is_timeout() {
        AuthError::Timeout
    } else {
        AuthError::Network
    }
}

pub(super) async fn query(
    url: Url,
    cookie: Option<header::HeaderValue>,
    user_agent: &str,
) -> Result<WorkbuddyUsage, AuthError> {
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(8))
        .redirect(Policy::none())
        .build()
        .map_err(transport_error)?;
    let mut request = client
        .post(url)
        .header(header::ACCEPT, "application/json")
        .header(header::USER_AGENT, user_agent)
        .header(header::ORIGIN, "https://www.workbuddy.cn")
        .header(header::REFERER, USAGE_PAGE)
        .header(header::CONTENT_TYPE, "application/json")
        .body("{}");
    if let Some(mut cookie) = cookie {
        cookie.set_sensitive(true);
        request = request.header(header::COOKIE, cookie);
    }
    let mut response = request.send().await.map_err(transport_error)?;
    status_result(response.status())?;
    if response
        .content_length()
        .is_some_and(|size| size > MAX_RESPONSE_BYTES as u64)
    {
        return Err(AuthError::InvalidResponse);
    }
    let mut body = Vec::new();
    while let Some(chunk) = response.chunk().await.map_err(transport_error)? {
        if body.len() + chunk.len() > MAX_RESPONSE_BYTES {
            return Err(AuthError::InvalidResponse);
        }
        body.extend_from_slice(&chunk);
    }
    parse_summary(&body, current_unix_millis())
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
        assert_eq!(
            parse_summary(no_packages, 0),
            Err(AuthError::InvalidResponse)
        );
        let bad_amount = br#"{"code":0,"data":{"Packages":[{"CapacityUnit":"credits","CycleTotalCapacity":"NaN","CycleRemainCapacity":"0"}]}}"#;
        assert_eq!(
            parse_summary(bad_amount, 0),
            Err(AuthError::InvalidResponse)
        );
        assert_eq!(
            parse_summary(br#"{"code":400,"data":null}"#, 0),
            Err(AuthError::InvalidResponse)
        );
    }

    #[test]
    fn only_explicit_auth_errors_count_as_rejections() {
        assert_eq!(
            status_result(StatusCode::UNAUTHORIZED),
            Err(AuthError::Unauthorized)
        );
        assert_eq!(
            status_result(StatusCode::FORBIDDEN),
            Err(AuthError::Forbidden)
        );
        assert_eq!(
            status_result(StatusCode::SERVICE_UNAVAILABLE),
            Err(AuthError::HttpStatus(503))
        );
        assert_eq!(
            status_result(StatusCode::FOUND),
            Err(AuthError::HttpStatus(302))
        );
        for body in [
            r#"{"error":"invalid_token","data":null}"#,
            r#"{"data":{"msg":"登录态已失效，请重新登录"}}"#,
        ] {
            assert_eq!(
                parse_summary(body.as_bytes(), 0),
                Err(AuthError::NotLoggedIn)
            );
        }
    }
}
