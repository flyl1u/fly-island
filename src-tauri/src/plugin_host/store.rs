//! `plugins.json`: whether third-party plugins may run, per plugin whether it
//! is on and which permissions the user granted, and the market's revocations,
//! trusted publishers and the automatic-update switch.

use serde::{Deserialize, Serialize};
use std::{collections::BTreeMap, fs, path::Path};

use super::{revocations::Revocation, sensitive::SensitiveChoice};

pub(super) const STATE_FILE_NAME: &str = "plugins.json";

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct PluginsState {
    /// Off by default: no plugin runs until the user allows third-party plugins.
    #[serde(default)]
    pub allow_third_party: bool,
    #[serde(default)]
    pub plugins: BTreeMap<String, PluginGrant>,
    /// The market's latest revocation list (revocations.rs), kept for offline starts.
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub revoked: Vec<Revocation>,
    /// Market publishers the user trusts (GitHub user or organization names).
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub trusted_publishers: Vec<String>,
    /// Install updates that ask for no new permissions by themselves (off by default).
    #[serde(default, skip_serializing_if = "std::ops::Not::not")]
    pub auto_update: bool,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct PluginGrant {
    #[serde(default)]
    pub enabled: bool,
    #[serde(default)]
    pub granted_permissions: Vec<String>,
    /// Values of the plugin's declared settings (contributes.settings).
    #[serde(default, skip_serializing_if = "serde_json::Map::is_empty")]
    pub settings: serde_json::Map<String, serde_json::Value>,
    /// The user turned off this plugin's `island.notify` messages.
    #[serde(default, skip_serializing_if = "std::ops::Not::not")]
    pub notifications_muted: bool,
    /// The user's remembered answers for sensitive permissions (sensitive.rs).
    #[serde(default, skip_serializing_if = "BTreeMap::is_empty")]
    pub sensitive: BTreeMap<String, SensitiveChoice>,
}

/// A missing or broken file reads as "nothing allowed".
pub(super) fn load_state(path: &Path) -> PluginsState {
    fs::read_to_string(path)
        .ok()
        .and_then(|text| serde_json::from_str(&text).ok())
        .unwrap_or_default()
}

pub(super) fn save_state(path: &Path, state: &PluginsState) -> Result<(), String> {
    let text = serde_json::to_string_pretty(state).map_err(|error| error.to_string())?;
    fs::write(path, text).map_err(|error| format!("Could not write {}: {error}", path.display()))
}
