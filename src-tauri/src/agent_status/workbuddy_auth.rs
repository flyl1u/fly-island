//! WorkBuddy renewal timing, failure decisions and cookie metadata for diagnostics.

use std::{
    fmt::{Display, Formatter, Write},
    time::{Duration, Instant},
};

use tauri::webview::Cookie;

const RETRY_INTERVALS: [u64; 6] = [30, 60, 120, 300, 600, 900];
const REJECTION_CONFIRMATION: Duration = Duration::from_secs(60);
const RENEWAL_INTERVAL: Duration = Duration::from_secs(30 * 60);
const MIN_VISIT_INTERVAL: Duration = Duration::from_secs(60);

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(super) enum AuthError {
    NoCookies,
    Unauthorized,
    Forbidden,
    NotLoggedIn,
    Network,
    Timeout,
    SiteLoad,
    SiteTimeout,
    Webview,
    CredentialRead,
    CurlUnavailable,
    HttpStatus(u16),
    InvalidResponse,
}

impl AuthError {
    pub(super) fn server_rejected(self) -> bool {
        matches!(
            self,
            Self::Unauthorized | Self::Forbidden | Self::NotLoggedIn
        )
    }
}

impl Display for AuthError {
    fn fmt(&self, formatter: &mut Formatter<'_>) -> std::fmt::Result {
        let reason = match self {
            Self::NoCookies => "no_cookie",
            Self::Unauthorized => "http_401",
            Self::Forbidden => "http_403",
            Self::NotLoggedIn => "server_not_logged_in",
            Self::Network => "network_error",
            Self::Timeout => "request_timeout",
            Self::SiteLoad => "site_load_failed",
            Self::SiteTimeout => "site_load_timeout",
            Self::Webview => "webview_error",
            Self::CredentialRead => "credential_read_failed",
            Self::CurlUnavailable => "system_curl_unavailable",
            Self::HttpStatus(status) => return write!(formatter, "http_{status}"),
            Self::InvalidResponse => "invalid_response",
        };
        formatter.write_str(reason)
    }
}

#[derive(Clone, Copy, Default)]
pub(super) struct FailedChecks {
    retry_step: usize,
    first_rejection: Option<Instant>,
}

#[derive(Debug, PartialEq, Eq)]
pub(super) enum FailureAction {
    RetryAfter(Duration),
    ClearSaved,
}

// One complete check contributes at most one rejection, even if recovery sent several requests.
pub(super) fn failure_action(
    mut history: FailedChecks,
    error: AuthError,
    now: Instant,
) -> (FailedChecks, FailureAction) {
    let backoff = Duration::from_secs(RETRY_INTERVALS[history.retry_step]);
    history.retry_step = (history.retry_step + 1).min(RETRY_INTERVALS.len() - 1);
    if !error.server_rejected() {
        history.first_rejection = None;
        return (history, FailureAction::RetryAfter(backoff));
    }

    let first = *history.first_rejection.get_or_insert(now);
    let remaining = REJECTION_CONFIRMATION.saturating_sub(now.saturating_duration_since(first));
    let action = if remaining.is_zero() {
        FailureAction::ClearSaved
    } else {
        FailureAction::RetryAfter(backoff.max(remaining))
    };
    (history, action)
}

#[derive(Clone, Copy)]
pub(super) struct Renewal {
    expires: Option<i64>,
    observed: i64,
    pub(super) at: Instant,
}

fn renewal_delay(expires: Option<i64>, observed: i64, now: i64) -> Duration {
    let Some(expires) = expires else {
        return RENEWAL_INTERVAL;
    };
    let lifetime = expires.saturating_sub(observed).max(0);
    let target = expires.saturating_sub(lifetime / 5);
    let seconds = target.saturating_sub(now.max(observed)).max(0) as u64;
    Duration::from_secs(seconds).min(RENEWAL_INTERVAL)
}

pub(super) fn renewal_schedule(
    previous: Option<Renewal>,
    now: Instant,
    wall_now: i64,
    expires: Option<i64>,
    visited: bool,
) -> Renewal {
    let unchanged = previous.filter(|previous| previous.expires == expires);
    if let (false, Some(unchanged)) = (visited, unchanged) {
        return unchanged;
    }
    let observed = unchanged.map_or(wall_now, |previous| previous.observed);
    let mut delay = renewal_delay(expires, observed, wall_now);
    // Near a fixed deadline, try again halfway through the time left without reloading
    // every minute throughout the last fifth of a long-lived cookie.
    if let (true, Some(_), Some(expires)) = (visited, unchanged, expires) {
        if delay < MIN_VISIT_INTERVAL {
            let left = expires.saturating_sub(wall_now.max(observed)).max(0) as u64;
            delay = Duration::from_secs(left / 2).min(RENEWAL_INTERVAL);
        }
    }
    let at = if visited {
        now + delay.max(MIN_VISIT_INTERVAL)
    } else {
        previous.map_or(now + delay, |previous| previous.at.min(now + delay))
    };
    Renewal {
        expires,
        observed,
        at,
    }
}

pub(super) fn is_auth_cookie(name: &str) -> bool {
    matches!(name, "session" | "session_2")
}

pub(super) struct CookieMetadata<'a> {
    pub(super) name: &'a str,
    pub(super) expires: Option<i64>,
}

impl<'a> From<&'a Cookie<'_>> for CookieMetadata<'a> {
    fn from(cookie: &'a Cookie<'_>) -> Self {
        Self {
            name: cookie.name(),
            expires: cookie
                .expires_datetime()
                .map(|expires| expires.unix_timestamp()),
        }
    }
}

fn diagnostic_line<'a>(
    operation: &str,
    reason: impl Display,
    cookies: impl IntoIterator<Item = CookieMetadata<'a>>,
) -> String {
    let mut line = format!("operation={operation} reason={reason}");
    let names: std::collections::BTreeSet<_> =
        cookies.into_iter().map(|cookie| cookie.name).collect();
    let _ = write!(line, " cookie_names={} {:?}", names.len(), names);
    line
}

pub(super) fn log<'a>(
    operation: &str,
    reason: impl Display,
    cookies: impl IntoIterator<Item = CookieMetadata<'a>>,
) {
    crate::app_log::write_line(
        "workbuddy-auth",
        &diagnostic_line(operation, reason, cookies),
    );
}

#[cfg(test)]
mod tests {
    use super::*;
    use tauri::webview::cookie::time::OffsetDateTime;

    #[test]
    fn temporary_errors_back_off_without_clearing_the_vault() {
        let now = Instant::now();
        let mut history = FailedChecks::default();
        for (error, seconds) in [
            (AuthError::NoCookies, 30),
            (AuthError::Network, 60),
            (AuthError::Timeout, 120),
            (AuthError::SiteLoad, 300),
            (AuthError::SiteTimeout, 600),
            (AuthError::HttpStatus(503), 900),
            (AuthError::InvalidResponse, 900),
        ] {
            let (next, action) = failure_action(history, error, now);
            assert_eq!(
                action,
                FailureAction::RetryAfter(Duration::from_secs(seconds))
            );
            history = next;
        }
    }

    #[test]
    fn an_expired_state_requires_consecutive_rejections_a_minute_apart() {
        let now = Instant::now();
        let (first, action) = failure_action(FailedChecks::default(), AuthError::Unauthorized, now);
        assert_eq!(action, FailureAction::RetryAfter(REJECTION_CONFIRMATION));

        let (second, action) =
            failure_action(first, AuthError::Forbidden, now + Duration::from_secs(59));
        assert!(matches!(action, FailureAction::RetryAfter(_)));
        assert_eq!(
            failure_action(second, AuthError::NotLoggedIn, now + REJECTION_CONFIRMATION).1,
            FailureAction::ClearSaved,
        );
        let (interrupted, _) =
            failure_action(first, AuthError::SiteTimeout, now + REJECTION_CONFIRMATION);
        assert!(matches!(
            failure_action(
                interrupted,
                AuthError::Forbidden,
                now + REJECTION_CONFIRMATION
            )
            .1,
            FailureAction::RetryAfter(_),
        ));
    }

    #[test]
    fn renews_at_eighty_percent_with_a_thirty_minute_fallback() {
        assert_eq!(
            renewal_delay(Some(1100), 100, 100),
            Duration::from_secs(800)
        );
        assert_eq!(
            renewal_delay(Some(1100), 100, 800),
            Duration::from_secs(100)
        );
        assert_eq!(renewal_delay(None, 100, 100), RENEWAL_INTERVAL);
        assert_eq!(renewal_delay(Some(8_000), 100, 100), RENEWAL_INTERVAL);
        assert_eq!(renewal_delay(Some(99), 100, 100), Duration::ZERO);
    }

    #[test]
    fn cached_expiry_never_moves_a_visit_later_after_the_clock_rolls_back() {
        let now = Instant::now();
        let first = renewal_schedule(None, now, 100, Some(1100), false);
        let later = renewal_schedule(
            Some(first),
            now + Duration::from_secs(120),
            10,
            Some(1100),
            false,
        );
        assert_eq!(first.at, later.at);

        let visited = renewal_schedule(Some(first), first.at, 1100, Some(1100), true);
        assert_eq!(visited.at, first.at + MIN_VISIT_INTERVAL);
    }

    #[test]
    fn a_visit_that_does_not_extend_the_cookie_uses_the_time_left() {
        let now = Instant::now();
        let planned = renewal_schedule(None, now, 100, Some(10_100), false);
        let visited = renewal_schedule(Some(planned), planned.at, 8_100, Some(10_100), true);
        assert_eq!(visited.at, planned.at + Duration::from_secs(1_000));
        let read = renewal_schedule(
            Some(visited),
            planned.at + Duration::from_secs(300),
            8_400,
            Some(10_100),
            false,
        );
        assert_eq!(read.at, visited.at);
    }

    #[test]
    fn diagnostics_include_metadata_without_cookie_values() {
        let cookies = [
            Cookie::build(("session", "synthetic-private-cookie-value")).build(),
            Cookie::build(("session_2", "synthetic-private-refresh-value"))
                .expires(OffsetDateTime::from_unix_timestamp(123_456).unwrap())
                .build(),
        ];
        let line = diagnostic_line(
            "retry",
            AuthError::Unauthorized,
            cookies.iter().map(CookieMetadata::from),
        );
        assert_eq!(
            line,
            "operation=retry reason=http_401 cookie_names=2 {\"session\", \"session_2\"}",
        );
        assert!(!line.contains("synthetic-private"));
    }
}
