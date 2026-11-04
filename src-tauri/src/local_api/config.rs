//! Local API settings, kept in `local-api.json` in the app data folder. Scripts
//! read the same file to find the port and token, so the saved port is always
//! the one the server is actually listening on.

use serde::{Deserialize, Serialize};
use std::{fs, path::Path};

pub(super) const CONFIG_FILE_NAME: &str = "local-api.json";
/// Tried first so the address stays the same across restarts; a free port is
/// picked when it is taken.
pub(super) const PREFERRED_PORT: u16 = 39271;
const TOKEN_BYTES: usize = 32;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct LocalApiConfig {
    #[serde(default)]
    pub enabled: bool,
    #[serde(default)]
    pub allow_write: bool,
    #[serde(default = "preferred_port")]
    pub port: u16,
    #[serde(default)]
    pub token: String,
}

fn preferred_port() -> u16 {
    PREFERRED_PORT
}

impl Default for LocalApiConfig {
    fn default() -> Self {
        Self {
            enabled: false,
            allow_write: false,
            port: PREFERRED_PORT,
            token: String::new(),
        }
    }
}

/// Reads the config; a missing or broken file gives the defaults. A missing or
/// too short token is replaced, and `changed` tells the caller to save.
pub(super) fn load_config(path: &Path) -> Result<(LocalApiConfig, bool), String> {
    let mut config = fs::read_to_string(path)
        .ok()
        .and_then(|text| serde_json::from_str::<LocalApiConfig>(&text).ok())
        .unwrap_or_default();
    let mut changed = false;
    if !is_valid_token(&config.token) {
        config.token = generate_token()?;
        changed = true;
    }
    if config.port == 0 {
        config.port = PREFERRED_PORT;
        changed = true;
    }
    Ok((config, changed))
}

pub(super) fn save_config(path: &Path, config: &LocalApiConfig) -> Result<(), String> {
    if let Some(dir) = path.parent() {
        fs::create_dir_all(dir)
            .map_err(|error| format!("Could not create {}: {error}", dir.display()))?;
    }
    let text = serde_json::to_string_pretty(config).map_err(|error| error.to_string())?;
    fs::write(path, text).map_err(|error| format!("Could not write {}: {error}", path.display()))
}

pub(super) fn generate_token() -> Result<String, String> {
    let mut bytes = [0u8; TOKEN_BYTES];
    getrandom::fill(&mut bytes)
        .map_err(|error| format!("Could not create an access token: {error}"))?;
    Ok(bytes.iter().map(|byte| format!("{byte:02x}")).collect())
}

pub(super) fn is_valid_token(token: &str) -> bool {
    token.len() == TOKEN_BYTES * 2 && token.bytes().all(|byte| byte.is_ascii_hexdigit())
}
