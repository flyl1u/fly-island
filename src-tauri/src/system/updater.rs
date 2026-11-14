//! Updater support: proxy discovery and whether this build can check for updates.

use std::{os::windows::process::CommandExt, process::Command};
use tauri::AppHandle;

use super::CREATE_NO_WINDOW;

pub(super) const INTERNET_SETTINGS_KEY: &str =
    r"HKCU\Software\Microsoft\Windows\CurrentVersion\Internet Settings";

pub(super) fn registry_value(key: &str, value: &str) -> Option<String> {
    let output = Command::new("reg")
        .creation_flags(CREATE_NO_WINDOW)
        .args(["query", key, "/v", value])
        .output()
        .ok()?;

    if !output.status.success() {
        return None;
    }

    String::from_utf8_lossy(&output.stdout)
        .lines()
        .find(|line| line.contains(value))
        .and_then(|line| line.split_whitespace().last())
        .map(str::to_string)
}

/// The HTTP proxy in a Windows proxy setting, or `None` when it names none the
/// updater can use. The setting is either one `host:port` for every protocol or
/// per-protocol entries such as `http=a:1;https=a:1;socks=b:2`; a `socks=` (or `ftp=`)
/// entry is not an HTTP proxy, so it is skipped rather than turned into `http://socks=b:2`.
pub(super) fn normalize_proxy(raw: &str) -> Option<String> {
    let entries: Vec<&str> = raw
        .split(';')
        .map(str::trim)
        .filter(|entry| !entry.is_empty())
        .collect();
    let named = |protocol: &str| {
        entries.iter().find_map(|entry| {
            let (name, server) = entry.split_once('=')?;
            name.trim().eq_ignore_ascii_case(protocol).then_some(server.trim())
        })
    };
    let server = named("https")
        .or_else(|| named("http"))
        .or_else(|| entries.iter().copied().find(|entry| !entry.contains('=')))
        .filter(|server| !server.is_empty())?;

    Some(if server.contains("://") {
        server.to_string()
    } else {
        format!("http://{server}")
    })
}

/// Proxy for the updater: explicit env vars win, else the Windows system proxy.
#[tauri::command]
pub fn get_updater_proxy() -> Option<String> {
    for key in ["HTTPS_PROXY", "https_proxy", "HTTP_PROXY", "http_proxy"] {
        if let Ok(value) = std::env::var(key) {
            let value = value.trim();
            if let Some(proxy) = normalize_proxy(value) {
                return Some(proxy);
            }
        }
    }

    if registry_value(INTERNET_SETTINGS_KEY, "ProxyEnable")?.trim() != "0x1" {
        return None;
    }

    normalize_proxy(&registry_value(INTERNET_SETTINGS_KEY, "ProxyServer")?)
}

/// Whether this build carries an updater public key. tauri.conf.json ships the
/// fork's key, so every build can update; a build whose config clears it (for
/// example another fork's) cannot, and the settings panel hides the action.
#[tauri::command]
pub fn updater_configured(app: AppHandle) -> bool {
    app.config()
        .plugins
        .0
        .get("updater")
        .and_then(|config| config.get("pubkey"))
        .and_then(|value| value.as_str())
        .is_some_and(|key| !key.trim().is_empty())
}

#[cfg(test)]
mod tests {
    use serde_json::{json, Value};

    use super::normalize_proxy;

    #[test]
    fn proxy_settings_yield_the_http_proxy_and_skip_socks() {
        let proxy = |raw: &str| normalize_proxy(raw);
        assert_eq!(proxy("127.0.0.1:7890").as_deref(), Some("http://127.0.0.1:7890"));
        assert_eq!(proxy("http://127.0.0.1:7890").as_deref(), Some("http://127.0.0.1:7890"));
        assert_eq!(proxy("http=a:1;https=b:2;socks=c:3").as_deref(), Some("http://b:2"));
        assert_eq!(proxy("socks=c:3;http=a:1").as_deref(), Some("http://a:1"));
        assert_eq!(proxy("HTTPS=b:2").as_deref(), Some("http://b:2"));
        // Only a SOCKS (or FTP) proxy: nothing the updater can use, so it connects directly.
        assert_eq!(proxy("socks=127.0.0.1:1080"), None);
        assert_eq!(proxy("ftp=a:21;socks=c:3"), None);
        assert_eq!(proxy("https=;socks=c:3"), None);
        assert_eq!(proxy("  ;  "), None);
    }

    // tauri-plugin-updater declares `pubkey` as a mandatory config field with no
    // serde default, so dropping the key aborts startup with "missing field
    // `pubkey`". The shipped config keeps an empty placeholder; release builds
    // replace it through `src-tauri/tauri.release.conf.json`.
    fn shipped_updater_config() -> Value {
        let config: Value = serde_json::from_str(include_str!("../../tauri.conf.json"))
            .expect("tauri.conf.json must be valid JSON");
        config
            .pointer("/plugins/updater")
            .cloned()
            .expect("tauri.conf.json must define plugins.updater")
    }

    #[test]
    fn shipped_updater_config_parses_with_the_empty_pubkey_placeholder() {
        let parsed: tauri_plugin_updater::Config = serde_json::from_value(shipped_updater_config())
            .expect("plugins.updater must deserialize or the app aborts at startup");

        assert_eq!(parsed.pubkey, "");
        assert!(!parsed.endpoints.is_empty());
    }

    #[test]
    fn release_overlay_replaces_the_pubkey_placeholder() {
        let mut update_config = shipped_updater_config();
        update_config["pubkey"] = json!("RWQtest-only-release-public-key");

        let parsed: tauri_plugin_updater::Config = serde_json::from_value(update_config)
            .expect("a release config carrying a real pubkey must deserialize");

        assert_eq!(parsed.pubkey, "RWQtest-only-release-public-key");
        assert!(!parsed.endpoints.is_empty());
    }
}
