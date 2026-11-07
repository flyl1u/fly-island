//! The approval endpoint's address, kept in `agent-approval.json` in the app data folder. The
//! hooks installed into Claude Code and Codex carry the port and token, so both stay the same
//! across restarts; the port only changes when the saved one is taken.

use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{fs, path::Path};

pub(super) const CONFIG_FILE_NAME: &str = "agent-approval.json";
/// Tried first; a free port is picked when it is taken.
pub(super) const PREFERRED_PORT: u16 = 47830;
const TOKEN_BYTES: usize = 32;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct ApprovalConfig {
    #[serde(default = "preferred_port")]
    pub port: u16,
    #[serde(default)]
    pub token: String,
}

fn preferred_port() -> u16 {
    PREFERRED_PORT
}

impl Default for ApprovalConfig {
    fn default() -> Self {
        Self { port: PREFERRED_PORT, token: String::new() }
    }
}

/// Reads the config; a missing or broken file gives the defaults. A missing or malformed token
/// is replaced, and `changed` tells the caller to save.
pub(super) fn load_config(path: &Path) -> Result<(ApprovalConfig, bool), String> {
    let mut config = fs::read_to_string(path)
        .ok()
        .and_then(|text| serde_json::from_str::<ApprovalConfig>(text.trim_start_matches('\u{feff}')).ok())
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

pub(super) fn save_config(path: &Path, config: &ApprovalConfig) -> Result<(), String> {
    if let Some(dir) = path.parent() {
        fs::create_dir_all(dir).map_err(|error| format!("Could not create {}: {error}", dir.display()))?;
    }
    let text = serde_json::to_string_pretty(config).map_err(|error| error.to_string())?;
    fs::write(path, text).map_err(|error| format!("Could not write {}: {error}", path.display()))
}

fn generate_token() -> Result<String, String> {
    let mut bytes = [0u8; TOKEN_BYTES];
    getrandom::fill(&mut bytes).map_err(|error| format!("Could not create an access token: {error}"))?;
    Ok(bytes.iter().map(|byte| format!("{byte:02x}")).collect())
}

/// The token an SSH remote computer's hooks carry (remote_setup.rs), told from the island's own
/// by its `X-FocuSD-Remote` host: one leaked from a shared server names only that server.
pub(super) fn remote_token(token: &str, host: &str) -> String {
    Sha256::digest(format!("focusd-remote:{host}:{token}")).iter().map(|byte| format!("{byte:02x}")).collect()
}

pub(super) fn is_valid_token(token: &str) -> bool {
    token.len() == TOKEN_BYTES * 2 && token.bytes().all(|byte| byte.is_ascii_hexdigit())
}
