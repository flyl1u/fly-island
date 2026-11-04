//! Windows integration: launch at startup, updater proxy and config, todo Markdown
//! export, full-screen app detection.

pub(crate) mod fullscreen;
pub(crate) mod startup;
pub(crate) mod todo_export;
pub(crate) mod updater;

use std::{env, path::PathBuf};

pub(crate) const CREATE_NO_WINDOW: u32 = 0x08000000;

pub(crate) fn windows_home_dir() -> Result<PathBuf, String> {
    if let Ok(user_profile) = env::var("USERPROFILE") {
        let user_profile = user_profile.trim();
        if !user_profile.is_empty() {
            return Ok(PathBuf::from(user_profile));
        }
    }

    match (env::var("HOMEDRIVE"), env::var("HOMEPATH")) {
        (Ok(home_drive), Ok(home_path)) if !home_drive.is_empty() && !home_path.is_empty() => {
            Ok(PathBuf::from(format!("{home_drive}{home_path}")))
        }
        _ => Err("Failed to resolve the Windows user profile directory.".to_string()),
    }
}
