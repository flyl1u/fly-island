//! A copy of the WorkBuddy website sign-in kept in the Windows Credential Manager.
//!
//! WebView2 drops session cookies (no `Expires`) whenever its browser process exits, and writes
//! persistent ones to disk only every few seconds, so quitting or restarting the island could lose
//! a sign-in that the site still honours. After a successful read the cookies sent to the billing
//! endpoint are saved here (DPAPI-protected per Windows user, never a plain file) and put back
//! into the isolated profile when it comes up without them. The server still decides validity.

use keyring::{Entry, Error as KeyringError};
use serde::{Deserialize, Serialize};
use tauri::webview::{cookie::time::OffsetDateTime, Cookie};

const SERVICE: &str = "com.focusd.island.workbuddy-web";
/// Each Credential Manager blob holds at most 2560 bytes; a cookie set is split over a few.
const CHUNK_BYTES: usize = 2400;
const MAX_CHUNKS: usize = 8;
const COOKIE_DOMAIN: &str = "workbuddy.cn";

#[derive(Serialize, Deserialize, Debug, Clone, PartialEq)]
pub(super) struct SavedCookie {
    name: String,
    value: String,
    domain: Option<String>,
    path: Option<String>,
    secure: Option<bool>,
    http_only: Option<bool>,
    /// Unix seconds; None for a session cookie.
    expires: Option<i64>,
}

fn entry(index: usize) -> Option<Entry> {
    Entry::new(SERVICE, &format!("cookies-{index}")).ok()
}

/// Only the WorkBuddy site's own cookies are kept or restored.
fn workbuddy_domain(domain: Option<&str>) -> bool {
    domain.is_none_or(|domain| {
        let domain = domain.trim_start_matches('.');
        domain == COOKIE_DOMAIN || domain.ends_with(".workbuddy.cn")
    })
}

pub(super) fn snapshot(cookies: &[Cookie<'static>], now: i64) -> Vec<SavedCookie> {
    cookies.iter().filter(|cookie| workbuddy_domain(cookie.domain())).filter_map(|cookie| {
        let expires = cookie.expires_datetime().map(|at| at.unix_timestamp());
        expires.is_none_or(|at| at > now).then(|| SavedCookie {
            name: cookie.name().to_string(),
            value: cookie.value().to_string(),
            domain: cookie.domain().map(str::to_string),
            path: cookie.path().map(str::to_string),
            secure: cookie.secure(),
            http_only: cookie.http_only(),
            expires,
        })
    }).collect()
}

pub(super) fn to_cookie(saved: &SavedCookie, now: i64) -> Option<Cookie<'static>> {
    if !workbuddy_domain(saved.domain.as_deref()) || saved.expires.is_some_and(|at| at <= now) { return None; }
    let mut cookie = Cookie::build((saved.name.clone(), saved.value.clone()))
        .path(saved.path.clone().unwrap_or_else(|| "/".to_string()));
    if let Some(domain) = &saved.domain { cookie = cookie.domain(domain.clone()); }
    if let Some(secure) = saved.secure { cookie = cookie.secure(secure); }
    if let Some(http_only) = saved.http_only { cookie = cookie.http_only(http_only); }
    if let Some(at) = saved.expires.and_then(|at| OffsetDateTime::from_unix_timestamp(at).ok()) {
        cookie = cookie.expires(at);
    }
    Some(cookie.build())
}

pub(super) fn encode(cookies: &[SavedCookie]) -> Option<Vec<Vec<u8>>> {
    let bytes = serde_json::to_vec(cookies).ok()?;
    let chunks: Vec<Vec<u8>> = bytes.chunks(CHUNK_BYTES).map(<[u8]>::to_vec).collect();
    (!chunks.is_empty() && chunks.len() <= MAX_CHUNKS).then_some(chunks)
}

pub(super) fn decode(chunks: &[Vec<u8>]) -> Option<Vec<SavedCookie>> {
    serde_json::from_slice(&chunks.concat()).ok()
}

/// Replaces the saved copy. A set too large to keep is not kept at all, never half of it.
pub(super) fn save(cookies: &[SavedCookie]) -> bool {
    let Some(chunks) = encode(cookies) else { clear(); return false; };
    for (index, chunk) in chunks.iter().enumerate() {
        if entry(index).is_none_or(|entry| entry.set_secret(chunk).is_err()) { clear(); return false; }
    }
    for index in chunks.len()..MAX_CHUNKS {
        if let Some(entry) = entry(index) { let _ = entry.delete_credential(); }
    }
    true
}

pub(super) fn load() -> Option<Vec<SavedCookie>> {
    let mut chunks = Vec::new();
    for index in 0..MAX_CHUNKS {
        match entry(index)?.get_secret() {
            Ok(chunk) => chunks.push(chunk),
            Err(KeyringError::NoEntry) => break,
            Err(_) => return None,
        }
    }
    decode(&chunks).filter(|cookies| !cookies.is_empty())
}

pub(super) fn clear() {
    for index in 0..MAX_CHUNKS {
        if let Some(entry) = entry(index) { let _ = entry.delete_credential(); }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn saved(name: &str, domain: Option<&str>, expires: Option<i64>) -> SavedCookie {
        SavedCookie { name: name.into(), value: "fictional".into(), domain: domain.map(str::to_string),
            path: Some("/".into()), secure: Some(true), http_only: Some(true), expires }
    }

    #[test]
    fn keeps_only_live_workbuddy_cookies() {
        let cookies = vec![
            Cookie::build(("session", "a")).domain(".workbuddy.cn").path("/").build(),
            Cookie::build(("other", "b")).domain("example.invalid").build(),
            Cookie::build(("old", "c")).domain("www.workbuddy.cn")
                .expires(OffsetDateTime::from_unix_timestamp(100).unwrap()).build(),
            Cookie::build(("evil", "d")).domain("workbuddy.cn.evil.test").build(),
        ];
        let kept = snapshot(&cookies, 1_000);
        assert_eq!(kept.iter().map(|c| c.name.as_str()).collect::<Vec<_>>(), ["session"]);
        assert!(to_cookie(&saved("x", Some("example.invalid"), None), 0).is_none());
        assert!(to_cookie(&saved("x", Some(".workbuddy.cn"), Some(10)), 20).is_none());
        let restored = to_cookie(&saved("x", Some(".workbuddy.cn"), Some(30)), 20).unwrap();
        assert_eq!(restored.expires_datetime().map(|at| at.unix_timestamp()), Some(30));
        assert_eq!(to_cookie(&saved("s", Some("www.workbuddy.cn"), None), 20).unwrap().expires_datetime(), None);
    }

    #[test]
    fn splits_into_credential_sized_chunks_and_back() {
        let many: Vec<_> = (0..40).map(|i| SavedCookie { value: "v".repeat(200), ..saved(&format!("c{i}"), Some(".workbuddy.cn"), None) }).collect();
        let chunks = encode(&many).unwrap();
        assert!(chunks.len() > 1 && chunks.iter().all(|chunk| chunk.len() <= CHUNK_BYTES));
        assert_eq!(decode(&chunks).unwrap(), many);
        let huge: Vec<_> = (0..200).map(|i| SavedCookie { value: "v".repeat(200), ..saved(&format!("c{i}"), None, None) }).collect();
        assert!(encode(&huge).is_none());
    }
}
