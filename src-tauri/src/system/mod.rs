//! Windows integration: launch at startup, updater proxy and config, todo Markdown
//! export, folder picker, full-screen app detection, settings backups.

pub(crate) mod folder_dialog;
pub(crate) mod fonts;
pub(crate) mod fullscreen;
mod fullscreen_hold;
pub(crate) mod theme_file;
pub(crate) mod startup;
pub(crate) mod todo_export;
pub(crate) mod todo_sync;
pub(crate) mod update_channel;
pub(crate) mod updater;
pub(crate) mod window_focus;

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

/// This module's Tauri commands. `lib.rs` chains every module's list into one
/// `generate_handler!`, so adding a command only touches this file.
macro_rules! tauri_commands {
    ($next:ident [$($done:tt)*] $($rest:tt)*) => {
        $next!([$($done)*
            crate::system::todo_export::save_todo_markdown,
            crate::system::todo_export::get_default_todo_save_directory,
            crate::system::todo_sync::read_todo_markdown,
            crate::system::todo_sync::save_todo_markdown_if_unchanged,
            crate::system::folder_dialog::pick_folder,
            crate::system::fonts::list_installed_fonts,
            crate::system::fullscreen::get_foreground_fullscreen,
            crate::system::startup::get_launch_at_startup,
            crate::system::startup::set_launch_at_startup,
            crate::system::startup::is_launch_at_startup_disabled,
            crate::system::startup::is_autostart_launch,
            crate::system::updater::get_updater_proxy,
            crate::system::updater::updater_configured,
            crate::system::update_channel::updater_check,
            crate::system::update_channel::updater_download,
            crate::system::update_channel::updater_install,
            crate::system::theme_file::save_theme_file,
        ] $($rest)*)
    };
}
pub(crate) use tauri_commands;
