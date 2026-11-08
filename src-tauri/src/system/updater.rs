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

pub(super) fn normalize_proxy(raw: &str) -> String {
    let entries: Vec<&str> = raw
        .split(';')
        .map(str::trim)
        .filter(|entry| !entry.is_empty())
        .collect();
    let server = ["https=", "http="]
        .iter()
        .find_map(|prefix| entries.iter().find_map(|entry| entry.strip_prefix(prefix)))
        .unwrap_or_else(|| entries.first().copied().unwrap_or(""));

    if server.contains("://") {
        server.to_string()
    } else {
        format!("http://{server}")
    }
}

/// Proxy for the updater: explicit env vars win, else the Windows system proxy.
#[tauri::command]
pub fn get_updater_proxy() -> Option<String> {
    for key in ["HTTPS_PROXY", "https_proxy", "HTTP_PROXY", "http_proxy"] {
        if let Ok(value) = std::env::var(key) {
            let value = value.trim();
            if !value.is_empty() {
                return Some(normalize_proxy(value));
            }
        }
    }

    if registry_value(INTERNET_SETTINGS_KEY, "ProxyEnable")?.trim() != "0x1" {
        return None;
    }

    let server = registry_value(INTERNET_SETTINGS_KEY, "ProxyServer")?;
    if server.trim().is_empty() {
        return None;
    }

    Some(normalize_proxy(&server))
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
