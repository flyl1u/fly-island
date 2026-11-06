use super::source::{
    fetch_api, https_entry, iso_from_unix_seconds, parse_access_token, parse_api_usage,
    parse_retry_after, pick_proxy, proxy_label, proxy_url, resolve_proxy, status_error, unix_ms,
    Limits,
};
use super::*;

const NOW_MS: u64 = 1_800_000_000_000;

fn window(percent: f64, resets_at: &str) -> Option<UsageWindow> {
    Some(UsageWindow {
        percent,
        resets_at: Some(resets_at.to_string()),
    })
}

#[test]
fn legacy_answer_reads_five_hour_and_seven_day() {
    let body = r#"{
        "five_hour": {"utilization": 42.0, "resets_at": "2026-11-06T12:00:00+00:00"},
        "seven_day": {"utilization": 17, "resets_at": "2026-11-10T00:00:00+00:00"},
        "seven_day_opus": null
    }"#;
    assert_eq!(
        parse_api_usage(body).unwrap(),
        Limits {
            five_hour: window(42.0, "2026-11-06T12:00:00+00:00"),
            seven_day: window(17.0, "2026-11-10T00:00:00+00:00"),
        }
    );
}

#[test]
fn limits_array_wins_over_the_legacy_objects() {
    let body = r#"{
        "five_hour": {"utilization": 1, "resets_at": "old"},
        "seven_day": {"utilization": 2, "resets_at": "old"},
        "limits": [
            {"kind": "weekly_scoped", "percent": 99, "resets_at": "x", "scope": {"model": {"id": "opus"}}},
            {"kind": "session", "percent": 63.5, "resets_at": "s"},
            {"kind": "weekly_all", "utilization": 120, "resets_at": "w"}
        ]
    }"#;
    assert_eq!(
        parse_api_usage(body).unwrap(),
        Limits {
            five_hour: window(63.5, "s"),
            seven_day: window(100.0, "w")
        }
    );
}

#[test]
fn limits_array_without_a_window_falls_back_to_legacy() {
    let body =
        r#"{"limits": [{"kind": "session", "percent": 5}], "seven_day": {"utilization": 8}}"#;
    let limits = parse_api_usage(body).unwrap();
    assert_eq!(
        limits.five_hour,
        Some(UsageWindow {
            percent: 5.0,
            resets_at: None
        })
    );
    assert_eq!(
        limits.seven_day,
        Some(UsageWindow {
            percent: 8.0,
            resets_at: None
        })
    );
}

#[test]
fn answer_without_limits_is_invalid() {
    for body in ["not json", "{}", r#"{"five_hour": {"utilization": null}}"#] {
        assert_eq!(
            parse_api_usage(body).unwrap_err().kind,
            UsageErrorKind::InvalidResponse
        );
    }
}

#[test]
fn credentials_give_the_token_and_reject_expired_or_missing_ones() {
    let file = |expires: u64| {
        format!(
            r#"{{"claudeAiOauth": {{"accessToken": "tok", "refreshToken": "r", "expiresAt": {expires}}}}}"#
        )
    };
    assert_eq!(
        parse_access_token(&file(NOW_MS + 1), NOW_MS).unwrap(),
        "tok"
    );
    assert_eq!(
        parse_access_token(&file(NOW_MS - 1), NOW_MS)
            .unwrap_err()
            .kind,
        UsageErrorKind::TokenExpired
    );
    for text in ["{}", r#"{"claudeAiOauth": {"accessToken": ""}}"#, "oops"] {
        assert_eq!(
            parse_access_token(text, NOW_MS).unwrap_err().kind,
            UsageErrorKind::NoCredentials
        );
    }
}

#[test]
fn statuses_map_to_error_kinds() {
    assert!(status_error(200, None).is_none());
    assert_eq!(
        status_error(401, None).unwrap().kind,
        UsageErrorKind::LoginRequired
    );
    assert_eq!(
        status_error(403, None).unwrap().kind,
        UsageErrorKind::Forbidden
    );
    assert_eq!(status_error(302, None).unwrap().kind, UsageErrorKind::Http);
    assert_eq!(status_error(500, None).unwrap().kind, UsageErrorKind::Http);
    let limited = status_error(429, Some("120")).unwrap();
    assert_eq!(limited.kind, UsageErrorKind::RateLimited);
    assert_eq!(limited.retry_after, Some(Duration::from_secs(120)));
    assert_eq!(
        status_error(429, Some("Wed, 21 Oct 2026 07:28:00 GMT"))
            .unwrap()
            .retry_after,
        None
    );
    assert_eq!(parse_retry_after("999999"), Some(Duration::from_secs(3600)));
}

#[test]
fn proxy_comes_from_settings_then_env_then_windows_and_never_a_default() {
    let pick = |configured, env, system| pick_proxy(configured, env, system);
    assert_eq!(
        pick(Some(" http://10.0.0.1:8080 "), Some("http://env:1"), Some("sys:2")).as_deref(),
        Some("http://10.0.0.1:8080")
    );
    assert_eq!(pick(Some("  "), Some(" http://env:1 "), Some("sys:2")).as_deref(), Some("http://env:1"));
    assert_eq!(pick(None, Some(""), Some("127.0.0.1:7897")).as_deref(), Some("127.0.0.1:7897"));
    assert_eq!(pick(None, None, None), None);
    assert_eq!(pick(Some(""), Some(" "), None), None);
}

#[test]
fn windows_proxy_server_values_give_the_https_entry() {
    assert_eq!(https_entry("127.0.0.1:7897").as_deref(), Some("127.0.0.1:7897"));
    assert_eq!(https_entry("http=a:1;https=b:2;socks=c:3").as_deref(), Some("b:2"));
    assert_eq!(https_entry("HTTP=a:1;ftp=f:1").as_deref(), Some("a:1"));
    assert_eq!(https_entry("socks=c:3"), None);
    assert_eq!(https_entry("https=;http=a:1").as_deref(), Some("a:1"));
    assert_eq!(https_entry("  "), None);
}

#[test]
fn only_http_proxies_are_accepted() {
    for raw in [
        "http://127.0.0.1:7897",
        "https://proxy.example:443",
        "127.0.0.1:7897",
    ] {
        assert!(proxy_url(raw).is_ok(), "{raw}");
    }
    for raw in [
        "socks5://127.0.0.1:1080",
        "socks://127.0.0.1:1080",
        "htps://127.0.0.1:7897",
        "http://",
        "file:///C:/x",
    ] {
        assert_eq!(
            proxy_url(raw).unwrap_err().kind,
            UsageErrorKind::Network,
            "{raw}"
        );
    }
    assert_eq!(proxy_url("127.0.0.1:7897").unwrap().scheme(), "http");
    let url = proxy_url("http://user:secret@10.0.0.1:8080").unwrap();
    assert_eq!(proxy_label(&url), "http://10.0.0.1:8080");
}

#[test]
fn numeric_reset_times_become_iso() {
    assert_eq!(iso_from_unix_seconds(0), "1970-01-01T00:00:00Z");
    assert_eq!(iso_from_unix_seconds(1_793_000_000), "2026-10-26T07:33:20Z");
    assert_eq!(iso_from_unix_seconds(951_825_600), "2000-02-29T12:00:00Z");
    let body = r#"{"five_hour": {"utilization": 1, "resets_at": 1793000000}, "seven_day": {"utilization": 2, "resets_at": 1793000000000}}"#;
    let limits = parse_api_usage(body).unwrap();
    assert_eq!(limits.five_hour, window(1.0, "2026-10-26T07:33:20Z"));
    assert_eq!(limits.seven_day, window(2.0, "2026-10-26T07:33:20Z"));
}

fn failure(kind: UsageErrorKind, retry_after: Option<Duration>) -> Result<Limits, FetchError> {
    Err(FetchError {
        kind,
        message: "m".into(),
        retry_after,
    })
}

fn ok() -> Result<Limits, FetchError> {
    Ok(Limits {
        five_hour: window(10.0, "r"),
        seven_day: None,
    })
}

fn error_kind(state: &State) -> Option<UsageErrorKind> {
    state.usage.error.as_ref().map(|error| error.kind)
}

/// The wait right after a request made at `now`.
fn wait_after_request(state: &mut State, now: Instant) -> Duration {
    state.last_request = Some(now);
    wait_before_poll(state, now)
}

#[test]
fn failures_keep_the_last_numbers_and_back_off() {
    let now = Instant::now();
    let mut state = State::default();
    assert_eq!(wait_before_poll(&state, now), Duration::ZERO);
    apply(&mut state, ok(), NOW_MS, now);
    assert_eq!(state.usage.updated_at, Some(NOW_MS));
    assert_eq!(
        wait_after_request(&mut state, now),
        Duration::from_secs(300)
    );
    assert_eq!(
        wait_before_poll(&state, now + Duration::from_secs(100)),
        Duration::from_secs(200)
    );

    apply(
        &mut state,
        failure(UsageErrorKind::LoginRequired, None),
        NOW_MS + 1,
        now,
    );
    assert_eq!(state.usage.five_hour, window(10.0, "r"));
    assert_eq!(state.usage.updated_at, Some(NOW_MS));
    assert_eq!(error_kind(&state), Some(UsageErrorKind::LoginRequired));
    assert_eq!(
        wait_after_request(&mut state, now),
        Duration::from_secs(600)
    );

    for _ in 0..10 {
        apply(
            &mut state,
            failure(UsageErrorKind::Network, None),
            NOW_MS,
            now,
        );
    }
    assert_eq!(
        wait_after_request(&mut state, now),
        Duration::from_secs(3600)
    );

    apply(&mut state, ok(), NOW_MS, now);
    assert_eq!(state.usage.error, None);
    assert_eq!(
        wait_after_request(&mut state, now),
        Duration::from_secs(300)
    );
}

#[test]
fn local_failures_do_not_back_off() {
    let now = Instant::now();
    let mut state = State::default();
    for kind in [UsageErrorKind::TokenExpired, UsageErrorKind::NoCredentials, UsageErrorKind::NoProxy] {
        apply(&mut state, failure(kind, None), NOW_MS, now);
        assert_eq!(error_kind(&state), Some(kind));
    }
    assert_eq!(state.failures, 0);
    assert_eq!(
        wait_after_request(&mut state, now),
        Duration::from_secs(300)
    );
    // A network failure, then a local one: the backoff starts over.
    apply(
        &mut state,
        failure(UsageErrorKind::Network, None),
        NOW_MS,
        now,
    );
    apply(
        &mut state,
        failure(UsageErrorKind::TokenExpired, None),
        NOW_MS,
        now,
    );
    assert_eq!(
        wait_after_request(&mut state, now),
        Duration::from_secs(300)
    );
}

#[test]
fn interval_is_clamped() {
    let now = Instant::now();
    let mut state = State::default();
    state.config.interval_minutes = u64::MAX;
    assert_eq!(
        wait_after_request(&mut state, now),
        Duration::from_secs(120 * 60)
    );
    state.config.interval_minutes = 1;
    assert_eq!(
        wait_after_request(&mut state, now),
        Duration::from_secs(300)
    );
}

#[test]
fn retry_after_sets_a_cooldown_longer_than_the_backoff() {
    let now = Instant::now();
    let mut state = State::default();
    apply(
        &mut state,
        failure(UsageErrorKind::RateLimited, Some(Duration::from_secs(1800))),
        NOW_MS,
        now,
    );
    assert_eq!(
        wait_after_request(&mut state, now),
        Duration::from_secs(1800)
    );
    assert_eq!(error_kind(&state), Some(UsageErrorKind::RateLimited));
}

#[test]
fn requests_are_gated_by_flight_cooldown_and_manual_gap() {
    let now = Instant::now();
    let mut state = State::default();
    assert!(may_request(&state, now, true));
    state.last_request = Some(now);
    assert!(may_request(&state, now + Duration::from_secs(1), false));
    assert!(!may_request(&state, now + Duration::from_secs(59), true));
    assert!(may_request(&state, now + Duration::from_secs(60), true));
    state.in_flight = true;
    assert!(!may_request(&state, now + Duration::from_secs(600), false));
    state.in_flight = false;
    state.cooldown_until = Some(now + Duration::from_secs(900));
    assert!(!may_request(&state, now + Duration::from_secs(600), false));
    assert!(may_request(&state, now + Duration::from_secs(901), true));
}

/// Prints the percentages only, never the token.
#[test]
#[ignore = "Calls api.anthropic.com with this account's Claude Code login through the proxy"]
fn live_usage_endpoint() {
    let now_ms = unix_ms(SystemTime::now());
    let limits = tauri::async_runtime::block_on(fetch_api(resolve_proxy(None).as_deref(), now_ms))
        .unwrap_or_else(|error| panic!("{:?}: {}", error.kind, error.message));
    println!(
        "five_hour={:?} seven_day={:?}",
        limits.five_hour, limits.seven_day
    );
    assert!(limits.five_hour.is_some() || limits.seven_day.is_some());
}
