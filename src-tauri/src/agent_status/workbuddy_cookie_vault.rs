//! WorkBuddy cookies in the Windows Credential Manager. WebView2 can lose session cookies
//! when its process exits and persistent cookies before they are written to disk.

use crate::legacy_migration;
use keyring::{Entry, Error as KeyringError};
use serde::{Deserialize, Serialize};
use tauri::webview::{
    cookie::{time::OffsetDateTime, SameSite},
    Cookie,
};

use super::workbuddy_auth::CookieMetadata;

const SERVICE: &str = "com.flyisland.app.workbuddy-web";
const ACTIVE_ENTRY: &str = "cookies-active";
/// Each Credential Manager blob holds at most 2560 bytes.
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
    /// Unix seconds. None for a session cookie.
    expires: Option<i64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    same_site: Option<SavedSameSite>,
}

#[derive(Serialize, Deserialize, Debug, Clone, Copy, PartialEq)]
enum SavedSameSite {
    Strict,
    Lax,
    None,
}

impl From<SameSite> for SavedSameSite {
    fn from(policy: SameSite) -> Self {
        match policy {
            SameSite::Strict => Self::Strict,
            SameSite::Lax => Self::Lax,
            SameSite::None => Self::None,
        }
    }
}

impl From<SavedSameSite> for SameSite {
    fn from(policy: SavedSameSite) -> Self {
        match policy {
            SavedSameSite::Strict => Self::Strict,
            SavedSameSite::Lax => Self::Lax,
            SavedSameSite::None => Self::None,
        }
    }
}

impl<'a> From<&'a SavedCookie> for CookieMetadata<'a> {
    fn from(cookie: &'a SavedCookie) -> Self {
        Self {
            name: &cookie.name,
            expires: cookie.expires,
        }
    }
}

#[derive(Serialize, Deserialize, Clone, Copy)]
enum Bank {
    Primary,
    Alternate,
}

impl Bank {
    fn other(self) -> Self {
        match self {
            Self::Primary => Self::Alternate,
            Self::Alternate => Self::Primary,
        }
    }

    fn entry_name(self, index: usize) -> String {
        match self {
            Self::Primary => format!("cookies-{index}"),
            Self::Alternate => format!("cookies-alt-{index}"),
        }
    }
}

#[derive(Serialize, Deserialize, Clone, Copy)]
struct Index {
    bank: Bank,
    chunks: usize,
}

pub(super) fn workbuddy_cookie(cookie: &Cookie<'_>) -> bool {
    workbuddy_domain(cookie.domain())
}

fn workbuddy_domain(domain: Option<&str>) -> bool {
    domain.is_some_and(|domain| {
        let domain = domain.trim_start_matches('.');
        domain == COOKIE_DOMAIN || domain.ends_with(".workbuddy.cn")
    })
}

pub(super) fn snapshot(cookies: &[Cookie<'static>], now: i64) -> Vec<SavedCookie> {
    let mut saved: Vec<_> = cookies
        .iter()
        .filter(|cookie| workbuddy_cookie(cookie))
        .filter_map(|cookie| {
            let expires = cookie.expires_datetime().map(|at| at.unix_timestamp());
            expires.is_none_or(|at| at > now).then(|| SavedCookie {
                name: cookie.name().to_string(),
                value: cookie.value().to_string(),
                domain: cookie.domain().map(str::to_string),
                path: cookie.path().map(str::to_string),
                secure: cookie.secure(),
                http_only: cookie.http_only(),
                expires,
                same_site: cookie.same_site().map(Into::into),
            })
        })
        .collect();
    saved.sort_by(|a, b| (&a.domain, &a.path, &a.name).cmp(&(&b.domain, &b.path, &b.name)));
    saved
}

fn to_cookie(saved: &SavedCookie, now: i64) -> Option<Cookie<'static>> {
    let domain = saved.domain.as_deref().unwrap_or("www.workbuddy.cn");
    if !workbuddy_domain(Some(domain)) || saved.expires.is_some_and(|at| at <= now) {
        return None;
    }
    let mut cookie = Cookie::build((saved.name.clone(), saved.value.clone()))
        .domain(domain.to_owned())
        .path(saved.path.clone().unwrap_or_else(|| "/".to_string()));
    if let Some(secure) = saved.secure {
        cookie = cookie.secure(secure);
    }
    if let Some(http_only) = saved.http_only {
        cookie = cookie.http_only(http_only);
    }
    if let Some(same_site) = saved.same_site {
        cookie = cookie.same_site(same_site.into());
    }
    if let Some(at) = saved.expires {
        cookie = cookie.expires(OffsetDateTime::from_unix_timestamp(at).ok()?);
    }
    Some(cookie.build())
}

pub(super) fn cookies_to_restore(
    saved: &[SavedCookie],
    current: &[Cookie<'static>],
    now: i64,
    replace: bool,
) -> Vec<Cookie<'static>> {
    saved
        .iter()
        .filter_map(|saved| to_cookie(saved, now))
        .filter(|saved| {
            !current.iter().any(|cookie| {
                cookie.name() == saved.name()
                    && cookie.domain() == saved.domain()
                    && cookie.path() == saved.path()
                    && cookie
                        .expires_datetime()
                        .is_none_or(|at| at.unix_timestamp() > now)
                    && (!replace
                        || (cookie.value() == saved.value()
                            && cookie.expires_datetime() == saved.expires_datetime()))
            })
        })
        .collect()
}

fn encode(cookies: &[SavedCookie]) -> Option<Vec<Vec<u8>>> {
    let bytes = serde_json::to_vec(cookies).ok()?;
    let chunks: Vec<Vec<u8>> = bytes.chunks(CHUNK_BYTES).map(<[u8]>::to_vec).collect();
    (chunks.len() <= MAX_CHUNKS).then_some(chunks)
}

fn decode(chunks: &[Vec<u8>]) -> Result<Vec<SavedCookie>, ()> {
    serde_json::from_slice(&chunks.concat()).map_err(|_| ())
}

/// Reads under the new service name; an entry still under the old one is moved over on first read.
fn read_secret(name: &str) -> Result<Option<Vec<u8>>, ()> {
    match legacy_migration::read_secret_bytes_with_fallback(SERVICE, name) {
        Ok(bytes) => Ok(bytes),
        Err(KeyringError::NoEntry) => Ok(None),
        Err(_) => Err(()),
    }
}

fn write_secret(name: &str, bytes: &[u8]) -> Result<(), ()> {
    Entry::new(SERVICE, name)
        .and_then(|entry| entry.set_secret(bytes))
        .map_err(|_| ())
}

fn delete_secret(name: &str) -> bool {
    matches!(
        legacy_migration::delete_credential_with_fallback(SERVICE, name),
        Ok(()) | Err(KeyringError::NoEntry)
    )
}

fn active_index() -> Result<Option<Index>, ()> {
    let Some(bytes) = read_secret(ACTIVE_ENTRY)? else {
        return Ok(None);
    };
    let index: Index = serde_json::from_slice(&bytes).map_err(|_| ())?;
    if !(1..=MAX_CHUNKS).contains(&index.chunks) {
        return Err(());
    }
    Ok(Some(index))
}

/// Commit the new index only after the inactive bank is complete. A failed write or exit midway
/// leaves the last verified snapshot available, including snapshots from older versions.
fn write_snapshot(
    active: Option<Index>,
    chunks: &[Vec<u8>],
    mut write: impl FnMut(&str, &[u8]) -> Result<(), ()>,
) -> Result<Index, ()> {
    let bank = active.map_or(Bank::Alternate, |index| index.bank.other());
    for (index, bytes) in chunks.iter().enumerate() {
        write(&bank.entry_name(index), bytes)?;
    }
    let index = Index {
        bank,
        chunks: chunks.len(),
    };
    write(ACTIVE_ENTRY, &serde_json::to_vec(&index).map_err(|_| ())?)?;
    Ok(index)
}

fn clear_bank(bank: Bank) -> bool {
    let mut cleared = true;
    for index in 0..MAX_CHUNKS {
        cleared &= delete_secret(&bank.entry_name(index));
    }
    cleared
}

pub(super) fn save(cookies: &[SavedCookie]) -> bool {
    let Some(chunks) = encode(cookies) else {
        return false;
    };
    let Ok(active) = active_index() else {
        return false;
    };
    let Ok(written) = write_snapshot(active, &chunks, write_secret) else {
        return false;
    };
    let _ = clear_bank(written.bank.other());
    true
}

pub(super) fn load() -> Result<Vec<SavedCookie>, ()> {
    let active = active_index()?;
    let bank = active.map_or(Bank::Primary, |index| index.bank);
    let count = active.map_or(MAX_CHUNKS, |index| index.chunks);
    let mut chunks = Vec::new();
    for index in 0..count {
        match read_secret(&bank.entry_name(index))? {
            Some(chunk) => chunks.push(chunk),
            None if active.is_none() => break,
            None => return Err(()),
        }
    }
    if chunks.is_empty() {
        Ok(Vec::new())
    } else {
        decode(&chunks)
    }
}

pub(super) fn clear() -> bool {
    // Keep the index if clearing either bank failed. The remaining inactive chunks must not
    // be mistaken for a legacy snapshot on the next start.
    let cleared = clear_bank(Bank::Primary) & clear_bank(Bank::Alternate);
    cleared && delete_secret(ACTIVE_ENTRY)
}

// --- Official-protocol credential (coexists with the cookie bank) -------------------------
// Stored under its own keyring entry so adding the official login never disturbs a saved
// website session. A separate clear path is used on sign-out.

const OAUTH_ENTRY: &str = "oauth-login";

/// Persist the official Bearer credential + identity. Fails closed.
pub(super) fn save_login(login: &super::workbuddy_official::SavedLogin) -> bool {
    let Ok(bytes) = serde_json::to_vec(login) else {
        return false;
    };
    write_secret(OAUTH_ENTRY, &bytes).is_ok()
}

/// Load the persisted official credential, if any and well-formed.
pub(super) fn load_login() -> Option<super::workbuddy_official::SavedLogin> {
    let bytes = read_secret(OAUTH_ENTRY).ok().flatten()?;
    serde_json::from_slice(&bytes).ok()
}

/// Remove only the official credential; the website cookie bank is left intact.
pub(super) fn clear_login() -> bool {
    delete_secret(OAUTH_ENTRY)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn saved(name: &str, domain: Option<&str>, expires: Option<i64>) -> SavedCookie {
        SavedCookie {
            name: name.into(),
            value: "fictional".into(),
            domain: domain.map(str::to_string),
            path: Some("/".into()),
            secure: Some(true),
            http_only: Some(true),
            expires,
            same_site: None,
        }
    }

    #[test]
    fn keeps_only_live_workbuddy_cookies() {
        let cookies = vec![
            Cookie::build(("session", "a"))
                .domain(".workbuddy.cn")
                .path("/")
                .build(),
            Cookie::build(("other", "b"))
                .domain("example.invalid")
                .build(),
            Cookie::build(("old", "c"))
                .domain("www.workbuddy.cn")
                .expires(OffsetDateTime::from_unix_timestamp(100).unwrap())
                .build(),
            Cookie::build(("evil", "d"))
                .domain("workbuddy.cn.evil.test")
                .build(),
        ];
        let kept = snapshot(&cookies, 1_000);
        assert_eq!(
            kept.iter().map(|c| c.name.as_str()).collect::<Vec<_>>(),
            ["session"]
        );
        assert!(to_cookie(&saved("x", Some("example.invalid"), None), 0).is_none());
        assert!(to_cookie(&saved("x", Some(".workbuddy.cn"), Some(10)), 20).is_none());
        let restored = to_cookie(&saved("x", Some(".workbuddy.cn"), Some(30)), 20).unwrap();
        assert_eq!(
            restored.expires_datetime().map(|at| at.unix_timestamp()),
            Some(30)
        );
        assert_eq!(
            to_cookie(&saved("s", Some("www.workbuddy.cn"), None), 20)
                .unwrap()
                .expires_datetime(),
            None
        );
    }

    #[test]
    fn restores_missing_session_cookies_alongside_persistent_cookies() {
        let persistent = Cookie::build(("session", "live"))
            .domain("www.workbuddy.cn")
            .path("/")
            .build();
        let saved = [
            saved("session", Some("www.workbuddy.cn"), None),
            SavedCookie {
                same_site: Some(SavedSameSite::Lax),
                ..saved("session_2", Some("www.workbuddy.cn"), None)
            },
        ];
        let restored = cookies_to_restore(&saved, std::slice::from_ref(&persistent), 100, false);
        assert_eq!(restored.len(), 1);
        assert_eq!(restored[0].name(), "session_2");
        assert_eq!(restored[0].same_site(), Some(SameSite::Lax));
        assert_eq!(restored[0].expires_datetime(), None);
        assert_eq!(
            cookies_to_restore(&saved, &[persistent], 100, true).len(),
            2
        );
    }

    #[test]
    fn splits_into_credential_sized_chunks_and_back() {
        let many: Vec<_> = (0..40)
            .map(|i| SavedCookie {
                value: "v".repeat(200),
                ..saved(&format!("c{i}"), Some(".workbuddy.cn"), None)
            })
            .collect();
        let chunks = encode(&many).unwrap();
        assert!(chunks.len() > 1 && chunks.iter().all(|chunk| chunk.len() <= CHUNK_BYTES));
        assert_eq!(decode(&chunks).unwrap(), many);
        let huge: Vec<_> = (0..200)
            .map(|i| SavedCookie {
                value: "v".repeat(200),
                ..saved(&format!("c{i}"), None, None)
            })
            .collect();
        assert!(encode(&huge).is_none());
    }

    #[test]
    fn a_partial_write_cannot_switch_away_from_the_previous_bank() {
        let mut writes = Vec::new();
        let active = Index {
            bank: Bank::Primary,
            chunks: 2,
        };
        let chunks = [vec![1], vec![2]];
        let result = write_snapshot(Some(active), &chunks, |name, _| {
            writes.push(name.to_owned());
            if name == "cookies-alt-1" {
                Err(())
            } else {
                Ok(())
            }
        });
        assert!(result.is_err());
        assert_eq!(writes, ["cookies-alt-0", "cookies-alt-1"]);

        writes.clear();
        assert!(write_snapshot(None, &chunks, |name, _| {
            writes.push(name.to_owned());
            Ok(())
        })
        .is_ok());
        assert_eq!(writes, ["cookies-alt-0", "cookies-alt-1", ACTIVE_ENTRY]);
    }
}
