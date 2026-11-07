//! Pushing agent events to the user's phone through Bark (roadmap B6.5.5). The island decides what
//! to send (src/features/agent-status/push); this sends it. The device key is a secret that lets
//! anyone push to the phone, so it lives in Windows Credential Manager, never in localStorage.

use std::time::Duration;

use keyring::{Entry, Error as KeyringError};
use serde_json::{json, Value};

use crate::win32::session_notifications;

const CREDENTIAL_SERVICE: &str = "com.focusd.island.bark";
const CREDENTIAL_USER: &str = "device-key";
/// Bark's own server; a self-hosted bark-server works the same.
const DEFAULT_SERVER: &str = "https://api.day.app";
const MAX_FIELD_CHARS: usize = 300;

fn credential() -> Result<Entry, String> {
    Entry::new(CREDENTIAL_SERVICE, CREDENTIAL_USER).map_err(|_| "无法访问 Windows 凭据。".into())
}

fn read_key() -> Result<Option<String>, String> {
    match credential()?.get_password() {
        Ok(key) => Ok(Some(key)),
        Err(KeyringError::NoEntry) => Ok(None),
        Err(_) => Err("无法读取 Windows 凭据。".into()),
    }
}

/// The address to post to: `<server>/push`. Only http(s); http is for a bark-server on the LAN.
pub(crate) fn push_url(server: &str) -> Result<reqwest::Url, String> {
    let server = server.trim().trim_end_matches('/');
    let server = if server.is_empty() { DEFAULT_SERVER } else { server };
    let url = reqwest::Url::parse(&format!("{server}/push")).map_err(|_| "Bark 服务器地址无效。".to_string())?;
    if !matches!(url.scheme(), "https" | "http") || url.host_str().is_none() {
        return Err("Bark 服务器地址要以 https:// 或 http:// 开头。".into());
    }
    Ok(url)
}

/// What Bark's `POST /push` takes. A Bark device key is what the app shows after its server URL.
pub(crate) fn push_body(key: &str, title: &str, body: &str, group: &str) -> Value {
    let cut = |text: &str| text.chars().take(MAX_FIELD_CHARS).collect::<String>();
    json!({ "device_key": key, "title": cut(title), "body": cut(body), "group": cut(group) })
}

/// A key as pasted: the app shows `https://api.day.app/<key>/...`, so a whole URL works too.
pub(crate) fn normalize_key(input: &str) -> Option<String> {
    let input = input.trim();
    let candidate = match input.split_once("://") {
        Some((_, rest)) => rest.split('/').nth(1).unwrap_or_default(),
        None => input,
    };
    let key = candidate.trim();
    (!key.is_empty() && key.len() <= 128 && key.chars().all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_'))
        .then(|| key.to_string())
}

#[tauri::command]
pub fn has_bark_key() -> Result<bool, String> {
    Ok(read_key()?.is_some())
}

#[tauri::command]
pub fn save_bark_key(key: String) -> Result<(), String> {
    let key = normalize_key(&key).ok_or_else(|| "这不像 Bark 的设备 Key：在 Bark 里复制推送地址或其中那串字母数字。".to_string())?;
    credential()?.set_password(&key).map_err(|_| "无法保存到 Windows 凭据。".into())
}

#[tauri::command]
pub fn delete_bark_key() -> Result<(), String> {
    match credential()?.delete_credential() {
        Ok(()) | Err(KeyringError::NoEntry) => Ok(()),
        Err(_) => Err("无法删除 Windows 凭据。".into()),
    }
}

/// Sends one push to the saved device; `server` empty means Bark's own server.
#[tauri::command]
pub async fn send_bark_push(server: String, title: String, body: String, group: String) -> Result<(), String> {
    let key = read_key()?.ok_or_else(|| "还没有填 Bark 设备 Key。".to_string())?;
    let url = push_url(&server)?;
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(10))
        .user_agent(concat!("FocuSD-Island/", env!("CARGO_PKG_VERSION")))
        .build()
        .map_err(|error| error.to_string())?;
    let response = client
        .post(url)
        .json(&push_body(&key, &title, &body, &group))
        .send()
        .await
        .map_err(|error| format!("连不上 Bark 服务器：{error}"))?;
    let status = response.status().as_u16();
    if (200..300).contains(&status) {
        return Ok(());
    }
    let reply: Value = response.json().await.unwrap_or(Value::Null);
    let message = reply["message"].as_str().unwrap_or_default();
    Err(match status {
        400 if message.contains("device") => "Bark 不认这个设备 Key，请重新复制。".to_string(),
        _ if message.is_empty() => format!("Bark 返回 {status}。"),
        _ => format!("Bark 返回 {status}：{message}"),
    })
}

/// Seconds since the last keyboard or mouse input; a locked screen keeps counting. None if unknown.
#[tauri::command]
pub fn get_user_idle_seconds() -> Option<u32> {
    session_notifications::idle_millis().map(|millis| millis / 1000)
}

/// This module's Tauri commands. `lib.rs` chains every module's list into one `generate_handler!`.
macro_rules! tauri_commands {
    ($next:ident [$($done:tt)*] $($rest:tt)*) => {
        $next!([$($done)*
            crate::phone_push::has_bark_key,
            crate::phone_push::save_bark_key,
            crate::phone_push::delete_bark_key,
            crate::phone_push::send_bark_push,
            crate::phone_push::get_user_idle_seconds,
        ] $($rest)*)
    };
}
pub(crate) use tauri_commands;

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn server_defaults_to_bark_and_takes_self_hosted_ones() {
        assert_eq!(push_url("").unwrap().as_str(), "https://api.day.app/push");
        assert_eq!(push_url("http://192.168.1.5:8080/ ").unwrap().as_str(), "http://192.168.1.5:8080/push");
        assert!(push_url("ftp://x").is_err());
        assert!(push_url("not a url").is_err());
    }

    #[test]
    fn keys_are_taken_bare_or_from_the_apps_url() {
        assert_eq!(normalize_key(" abcDEF123 ").as_deref(), Some("abcDEF123"));
        assert_eq!(normalize_key("https://api.day.app/abcDEF123/这里改成你自己的推送内容").as_deref(), Some("abcDEF123"));
        assert_eq!(normalize_key("https://api.day.app/"), None);
        assert_eq!(normalize_key("has space"), None);
    }

    #[test]
    fn long_text_is_cut_and_the_group_kept() {
        let body = push_body("k", &"标".repeat(500), "b", "fly-island");
        assert_eq!(body["title"].as_str().unwrap().chars().count(), MAX_FIELD_CHARS);
        assert_eq!(body["device_key"], "k");
        assert_eq!(body["group"], "fly-island");
    }
}
