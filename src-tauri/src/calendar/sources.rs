//! The calendars the user added. `calendar-sources.json` in the app data folder keeps what can be
//! shown (kind, name, server and account); what gives access to the calendar (an ICS link, which
//! anyone holding it can read, or a CalDAV password) goes to the Windows Credential Manager, like
//! the mail authorization codes.

use std::{fs, path::Path};

use keyring::{Entry, Error as KeyringError};
use serde::{Deserialize, Serialize};

pub(super) const FILE_NAME: &str = "calendar-sources.json";
const CREDENTIAL_SERVICE: &str = "com.focusd.island.calendar";
/// Calendars kept at most.
pub(super) const MAX_SOURCES: usize = 8;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum SourceKind {
    /// An iCalendar subscription link (Google's secret address, a published Outlook calendar).
    Ics,
    /// A CalDAV server or calendar with an account and password (Feishu, DingTalk, WeCom, iCloud).
    Caldav,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CalendarSource {
    pub(super) id: String,
    pub(super) kind: SourceKind,
    pub(super) name: String,
    /// The CalDAV address; empty for ICS, whose link is the secret.
    #[serde(default)]
    pub(super) url: String,
    /// The link's or server's host, to tell sources apart without showing an ICS link.
    pub(super) host: String,
    #[serde(default)]
    pub(super) username: String,
}

pub(super) fn read(app_dir: &Path) -> Vec<CalendarSource> {
    fs::read_to_string(app_dir.join(FILE_NAME))
        .ok()
        .and_then(|text| serde_json::from_str(&text).ok())
        .unwrap_or_default()
}

pub(super) fn write(app_dir: &Path, sources: &[CalendarSource]) -> Result<(), String> {
    fs::create_dir_all(app_dir).map_err(|error| error.to_string())?;
    let text = serde_json::to_string_pretty(sources).map_err(|error| error.to_string())?;
    fs::write(app_dir.join(FILE_NAME), text).map_err(|error| format!("无法保存日历设置：{error}"))
}

fn credential(id: &str) -> Result<Entry, String> {
    Entry::new(CREDENTIAL_SERVICE, id).map_err(|_| "无法访问 Windows 凭据。".into())
}

pub(super) fn read_secret(id: &str) -> Result<Option<String>, String> {
    match credential(id)?.get_password() {
        Ok(secret) => Ok(Some(secret)),
        Err(KeyringError::NoEntry) => Ok(None),
        Err(_) => Err("无法读取 Windows 凭据。".into()),
    }
}

pub(super) fn save_secret(id: &str, secret: &str) -> Result<(), String> {
    credential(id)?.set_password(secret).map_err(|_| "无法保存到 Windows 凭据。".into())
}

pub(super) fn delete_secret(id: &str) -> Result<(), String> {
    match credential(id)?.delete_credential() {
        Ok(()) | Err(KeyringError::NoEntry) => Ok(()),
        Err(_) => Err("无法删除 Windows 凭据。".into()),
    }
}

/// An ICS link as given: `webcal://` becomes `https://`; anything but https is refused, since the
/// link itself grants access and must not travel in the clear.
pub(super) fn ics_url(link: &str) -> Result<reqwest::Url, String> {
    let link = link.trim();
    let link = match link.strip_prefix("webcal://") {
        Some(rest) => format!("https://{rest}"),
        None => link.to_string(),
    };
    let url = reqwest::Url::parse(&link).map_err(|_| "订阅链接无效。".to_string())?;
    if url.scheme() != "https" || url.host_str().is_none() {
        return Err("订阅链接要以 https:// 或 webcal:// 开头。".into());
    }
    Ok(url)
}

/// The host of a link, for display.
pub(super) fn host_of(url: &str) -> String {
    reqwest::Url::parse(url.trim()).ok().and_then(|url| url.host_str().map(str::to_string)).unwrap_or_default()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ics_links_must_be_https_and_webcal_becomes_https() {
        assert_eq!(ics_url(" webcal://p01-caldav.icloud.com/published/2/abc ").unwrap().as_str(), "https://p01-caldav.icloud.com/published/2/abc");
        assert!(ics_url("https://calendar.google.com/calendar/ical/x/private-y/basic.ics").is_ok());
        assert!(ics_url("http://example.com/a.ics").is_err());
        assert!(ics_url("not a link").is_err());
        assert_eq!(host_of("https://caldav.feishu.cn/abc"), "caldav.feishu.cn");
        assert_eq!(host_of("nonsense"), "");
    }

    #[test]
    fn sources_are_saved_without_secrets() {
        let dir = std::env::temp_dir().join(format!("focusd-calendar-{}", std::process::id()));
        assert!(read(&dir).is_empty());
        let source = CalendarSource {
            id: "c1".into(),
            kind: SourceKind::Caldav,
            name: "飞书".into(),
            url: "https://caldav.feishu.cn".into(),
            host: "caldav.feishu.cn".into(),
            username: "u_abc".into(),
        };
        write(&dir, std::slice::from_ref(&source)).unwrap();
        assert_eq!(read(&dir), [source]);
        let saved = fs::read_to_string(dir.join(FILE_NAME)).unwrap();
        assert!(saved.contains("\"kind\": \"caldav\"") && !saved.contains("password"));
        fs::remove_dir_all(&dir).unwrap();
    }
}
