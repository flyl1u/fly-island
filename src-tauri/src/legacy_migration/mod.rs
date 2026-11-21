//! One-shot compatibility for installations created before the Fly Island rename.
//!
//! All former product identifiers live here so ordinary code and documentation cannot accidentally
//! publish them again. Every operation is best effort and can be retried safely on the next launch.

use std::{
    env,
    fs::{self, OpenOptions},
    io::Write,
    path::{Path, PathBuf},
};

#[cfg(windows)]
use std::{os::windows::process::CommandExt, process::Command};

use keyring::{Entry, Error as KeyringError};
use serde_json::Value;
use windows::Win32::System::Registry::HKEY_CURRENT_USER;

use crate::win32::registry;

pub(crate) const NEW_IDENTIFIER: &str = "com.flyisland.app";
const OLD_IDENTIFIER: &str = "com.focusd.island";
const OLD_STARTUP_VALUE: &str = "FocuSD Island";
const NEW_STARTUP_VALUE: &str = "Fly Island";
const STARTUP_KEY: &str = r"Software\Microsoft\Windows\CurrentVersion\Run";
const OLD_HOOK_SIGNATURE: &str = "focusd-agent-";
const NEW_HOOK_SIGNATURE: &str = "fly-island-agent-";
const OLD_HOOK_MARKER: &str = "FocuSD Agent Status Hooks";
const NEW_HOOK_MARKER: &str = "Fly Island Agent Status Hooks";
const OLD_HOOK_HEADER: &str = "X-FocuSD-Hook";
const NEW_HOOK_HEADER: &str = "X-Fly-Island-Hook";
const OLD_RULES_FILE: &str = "rules/focusd-island-reply-marker.md";
const OLD_LOG_FILES: [(&str, &str); 2] = [("focusd-island.log", "fly-island.log"), ("focusd-island.1.log", "fly-island.1.log")];
const OLD_BACKUP_APP_NAMES: [&str; 2] = ["focusd", "focusd-island"];
const OLD_CUSTOM_IDENTIFIER: &str = "com.focusd.island.custom";
const OLD_HOOK_FILES: [&str; 4] = [
    "focusd-agent-approval.ps1",
    "focusd-agent-running.cmd",
    "focusd-agent-session.ps1",
    "focusd-agent-status.ps1",
];
const OLD_STORAGE_PREFIX: &str = "focusd-island-";
const NEW_STORAGE_PREFIX: &str = "fly-island-";
const OLD_REPLY_PREFIX: &str = "<!-- focusd-island: reply marker";
const OLD_REPLY_END: &str = "<!-- /focusd-island: reply marker -->";
const OLD_ENV_PREFIX: &str = "FOCUSD_";
const NEW_ENV_PREFIX: &str = "FLY_ISLAND_";
const OLD_PROCESS_IMAGE: &str = "focusd-island.exe";

/// Runs before `tauri::Builder` or any WebView is created. Returns `false` when a former data
/// directory could not be moved: the app must then exit, because continuing would let Tauri create
/// an empty new directory and the old data would never be migrated. The next launch retries.
pub(crate) fn run() -> bool {
    if legacy_data_directories_exist() {
        stop_legacy_process();
    }
    let Some(migrated) = migrate_data_directories() else {
        crate::win32::message_box::show_warning(
            "Fly Island",
            "Fly Island 无法迁移旧版本的数据（文件正被占用）。数据没有丢失，请关闭正在运行的旧版本后重新打开。

             Fly Island could not move the data from the previous version because its files are in use.              Nothing was lost: close the old version and open Fly Island again.",
        );
        return false;
    };
    migrate_startup_value();
    remove_legacy_hook_files(&migrated);
    true
}

fn legacy_data_directories_exist() -> bool {
    app_data_roots().any(|root| root.join(OLD_IDENTIFIER).is_dir() || root.join(OLD_CUSTOM_IDENTIFIER).is_dir())
}

/// New code asks for a new environment variable and accepts the former spelling only here.
pub(crate) fn env(name: &str) -> Option<String> {
    std::env::var(name)
        .ok()
        .or_else(|| name.strip_prefix(NEW_ENV_PREFIX).and_then(|suffix| std::env::var(format!("{OLD_ENV_PREFIX}{suffix}")).ok()))
}


#[cfg(windows)]
fn stop_legacy_process() {
    let _ = Command::new("taskkill")
        .args(["/F", "/T", "/IM", OLD_PROCESS_IMAGE])
        .creation_flags(crate::system::CREATE_NO_WINDOW)
        .status();
}

#[cfg(not(windows))]
fn stop_legacy_process() {}

fn app_data_roots() -> impl Iterator<Item = PathBuf> {
    [env::var_os("APPDATA"), env::var_os("LOCALAPPDATA")]
        .into_iter()
        .flatten()
        .map(PathBuf::from)
}

/// `None` when a former directory still exists but could not be moved or copied.
fn migrate_data_directories() -> Option<Vec<PathBuf>> {
    let mut destinations = Vec::new();
    let mut failed = false;
    for root in app_data_roots() {
        for (old_name, new_name) in [
            (OLD_IDENTIFIER, NEW_IDENTIFIER),
            (OLD_CUSTOM_IDENTIFIER, "com.flyisland.app.custom"),
        ] {
            let old = root.join(old_name);
            let new = root.join(new_name);
            match migrate_directory(&old, &new) {
                DirectoryMigration::Failed => {
                    append_migration_log(&old, "data directory migration failed; will retry on next launch");
                    failed = true;
                }
                DirectoryMigration::NotNeeded if !new.is_dir() => {}
                DirectoryMigration::Moved | DirectoryMigration::NotNeeded => {
                    migrate_legacy_log_files(&old, &new);
                    destinations.push(new);
                    if old.is_dir() {
                        destinations.push(old);
                    }
                }
            }
        }
    }
    (!failed).then_some(destinations)
}

#[derive(Debug, PartialEq, Eq)]
enum DirectoryMigration {
    /// No former directory, or the new one already exists and is never overwritten.
    NotNeeded,
    Moved,
    Failed,
}

/// Right after an update the previous version's WebView processes can hold files for a moment,
/// so a failed rename is retried with backoff (about six seconds in all) before copying.
const RENAME_RETRY_DELAYS_MS: [u64; 5] = [200, 400, 800, 1600, 3200];

fn migrate_directory(old: &Path, new: &Path) -> DirectoryMigration {
    migrate_directory_with(old, new, |source, destination| {
        let mut result = fs::rename(source, destination);
        for delay in RENAME_RETRY_DELAYS_MS {
            if result.is_ok() {
                break;
            }
            std::thread::sleep(std::time::Duration::from_millis(delay));
            result = fs::rename(source, destination);
        }
        result
    })
}

fn migrate_directory_with<R>(old: &Path, new: &Path, rename: R) -> DirectoryMigration
where
    R: FnOnce(&Path, &Path) -> std::io::Result<()>,
{
    if !old.is_dir() || new.exists() {
        return DirectoryMigration::NotNeeded;
    }
    let (outcome, result) = match rename(old, new) {
        Ok(()) => ("renamed", DirectoryMigration::Moved),
        Err(_) => match copy_tree(old, new) {
            Ok(()) => {
                // Everything is in the new directory; a leftover old copy would only confuse.
                let _ = fs::remove_dir_all(old);
                ("copied", DirectoryMigration::Moved)
            }
            Err(_) => {
                let _ = fs::remove_dir_all(new);
                ("failed", DirectoryMigration::Failed)
            }
        },
    };
    if result == DirectoryMigration::Moved {
        append_migration_log(new, &format!("data directory migration {outcome}"));
    }
    result
}

fn migrate_legacy_log_files(old: &Path, new: &Path) {
    let old_logs = old.join("logs");
    let new_logs = new.join("logs");
    let mut migrated = false;
    for (old_name, new_name) in OLD_LOG_FILES {
        for source in [old_logs.join(old_name), new_logs.join(old_name)] {
            if !source.is_file() {
                continue;
            }
            if fs::create_dir_all(&new_logs).is_err() {
                continue;
            }
            let destination = new_logs.join(new_name);
            let moved = if destination.exists() {
                append_file_and_remove(&source, &destination)
            } else {
                fs::rename(&source, &destination).is_ok()
                    || (fs::copy(&source, &destination).is_ok() && fs::remove_file(&source).is_ok())
            };
            migrated |= moved;
        }
    }
    if migrated {
        append_migration_log(new, "legacy log filenames migrated");
    }
}

fn append_file_and_remove(source: &Path, destination: &Path) -> bool {
    let Ok(bytes) = fs::read(source) else {
        return false;
    };
    let Ok(mut file) = OpenOptions::new().create(true).append(true).open(destination) else {
        return false;
    };
    if file.write_all(&bytes).is_err() {
        return false;
    }
    drop(file);
    fs::remove_file(source).is_ok()
}

fn copy_tree(source: &Path, destination: &Path) -> std::io::Result<()> {
    fs::create_dir_all(destination)?;
    for entry in fs::read_dir(source)? {
        let entry = entry?;
        let from = entry.path();
        let to = destination.join(entry.file_name());
        if from.is_dir() {
            copy_tree(&from, &to)?;
        } else if !to.exists() {
            fs::copy(&from, &to)?;
        }
    }
    Ok(())
}

fn append_migration_log(directory: &Path, message: &str) {
    let path = directory.join("logs").join("fly-island.log");
    if let Some(parent) = path.parent() {
        let _ = fs::create_dir_all(parent);
    }
    if let Ok(mut file) = OpenOptions::new().create(true).append(true).open(path) {
        let _ = writeln!(file, "[migration] {message}");
    }
}

/// Task Manager's on/off switch for a Run value, stored under the same value name.
const STARTUP_APPROVED_KEY: &str = r"Software\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\Run";

#[derive(Debug, PartialEq, Eq)]
enum StartupMigration {
    Skip,
    RemoveDuplicate,
    Move,
}

fn startup_migration(has_legacy: bool, has_current: bool) -> StartupMigration {
    match (has_legacy, has_current) {
        (false, _) => StartupMigration::Skip,
        (true, true) => StartupMigration::RemoveDuplicate,
        (true, false) => StartupMigration::Move,
    }
}

fn migrate_startup_value() {
    let current = registry::read_string(HKEY_CURRENT_USER, STARTUP_KEY, NEW_STARTUP_VALUE);
    match startup_migration(legacy_startup_value_present(), current.is_some()) {
        StartupMigration::Skip => return,
        StartupMigration::RemoveDuplicate => {
            // An old development build may still exist. Keep the current installation's
            // command and Startup Apps preference and remove the second launch entry.
            delete_legacy_startup_value();
            return;
        }
        StartupMigration::Move => {}
    }
    let Ok(value) = crate::system::startup::startup_value() else {
        return;
    };
    // The Task Manager state moves first: a Run value renamed without it would start the island
    // again at sign-in for a user who had disabled it there. If it cannot move, neither does the
    // Run value, so the old pair keeps working and the next launch retries.
    if let Some(state) = registry::read_binary(HKEY_CURRENT_USER, STARTUP_APPROVED_KEY, OLD_STARTUP_VALUE) {
        if registry::write_binary(HKEY_CURRENT_USER, STARTUP_APPROVED_KEY, NEW_STARTUP_VALUE, &state).is_err() {
            return;
        }
    }
    if registry::write_string(HKEY_CURRENT_USER, STARTUP_KEY, NEW_STARTUP_VALUE, &value).is_ok() {
        delete_legacy_startup_value();
    }
}

fn remove_legacy_hook_files(destinations: &[PathBuf]) {
    let mut directories = destinations.to_vec();
    for root in app_data_roots() {
        for (old_name, new_name) in [
            (OLD_IDENTIFIER, NEW_IDENTIFIER),
            (OLD_CUSTOM_IDENTIFIER, "com.flyisland.app.custom"),
        ] {
            let old = root.join(old_name);
            if root.join(new_name).is_dir() {
                directories.push(old);
            }
        }
    }
    for directory in directories {
        for name in OLD_HOOK_FILES {
            let _ = fs::remove_file(directory.join(name));
        }
    }
}

pub(crate) fn remove_hook_files_everywhere() {
    for root in app_data_roots() {
        for directory_name in [OLD_IDENTIFIER, NEW_IDENTIFIER, OLD_CUSTOM_IDENTIFIER, "com.flyisland.app.custom"] {
            let directory = root.join(directory_name);
            for name in OLD_HOOK_FILES.into_iter().chain([
                "fly-island-agent-approval.ps1",
                "fly-island-agent-running.cmd",
                "fly-island-agent-session.ps1",
                "fly-island-agent-status.ps1",
            ]) {
                let _ = fs::remove_file(directory.join(name));
            }
        }
    }
}

/// Normalizes a legacy configuration backup before the normal validator sees it.
/// New keys win when a backup contains both generations.
pub(crate) fn normalize_legacy_backup_value(value: &mut Value) {
    let Some(object) = value.as_object_mut() else {
        return;
    };
    if object.get("app").and_then(Value::as_str).is_some_and(is_legacy_backup_app) {
        object.insert("app".into(), Value::String("fly-island".into()));
    }
    let Some(Value::Object(storage)) = object.get_mut("localStorage") else {
        return;
    };
    let legacy_keys: Vec<String> = storage
        .keys()
        .filter(|key| key.starts_with(OLD_STORAGE_PREFIX))
        .cloned()
        .collect();
    for legacy_key in legacy_keys {
        let current_key = format!("{NEW_STORAGE_PREFIX}{}", &legacy_key[OLD_STORAGE_PREFIX.len()..]);
        if let Some(value) = storage.remove(&legacy_key) {
            storage.entry(current_key).or_insert(value);
        }
    }
}

fn is_legacy_backup_app(value: &str) -> bool {
    OLD_BACKUP_APP_NAMES.contains(&value)
}

/// True when a config still holds a hook written before the rename (its script path is gone).
pub(crate) fn contains_legacy_hook_signature(text: &str) -> bool {
    text.contains(OLD_HOOK_SIGNATURE)
}

/// Recognises both signatures while preserving user-owned hooks.
pub(crate) fn contains_managed_hook_signature(text: &str) -> bool {
    text.contains(NEW_HOOK_SIGNATURE) || text.contains(OLD_HOOK_SIGNATURE)
}

/// Converts a managed hook entry to the current spelling. Callers only apply this to entries that
/// already contain a managed signature, so arbitrary user configuration is left untouched.
pub(crate) fn normalize_hook_text(text: &str) -> String {
    text.split_inclusive('\n')
        .map(|line| {
            if !line.contains(OLD_HOOK_SIGNATURE)
                && !line.contains(NEW_HOOK_SIGNATURE)
                && !line.contains(OLD_HOOK_HEADER)
                && !line.contains(NEW_HOOK_HEADER)
                && !line.contains(OLD_HOOK_MARKER)
                && !line.contains(NEW_HOOK_MARKER)
            {
                return line.to_string();
            }
            line.replace(OLD_HOOK_SIGNATURE, NEW_HOOK_SIGNATURE)
                .replace(OLD_HOOK_HEADER, NEW_HOOK_HEADER)
                .replace(OLD_HOOK_MARKER, NEW_HOOK_MARKER)
                .replace("focusd-island", "fly-island")
                .replace("FocuSD Island", "Fly Island")
                .replace("FocuSD agent", "Fly Island agent")
        })
        .collect()
}

pub(crate) fn value_contains_managed_hook_signature(value: &Value) -> bool {
    match value {
        Value::String(text) => contains_managed_hook_signature(text),
        Value::Array(values) => values.iter().any(value_contains_managed_hook_signature),
        Value::Object(values) => values.values().any(value_contains_managed_hook_signature),
        Value::Null | Value::Bool(_) | Value::Number(_) => false,
    }
}

fn old_service_name(service: &str) -> Option<String> {
    service.strip_prefix(NEW_IDENTIFIER).map(|suffix| format!("{OLD_IDENTIFIER}{suffix}"))
}

/// Read a new credential and, on a miss, copy the old service entry forward once.
pub(crate) fn read_credential_with_fallback(service: &str, account: &str) -> Result<Option<String>, KeyringError> {
    let current = Entry::new(service, account)?;
    match current.get_password() {
        Ok(secret) => Ok(Some(secret)),
        Err(KeyringError::NoEntry) => {
            let Some(old_service) = old_service_name(service) else {
                return Ok(None);
            };
            let old = Entry::new(&old_service, account)?;
            match old.get_password() {
                Ok(secret) => {
                    if current.set_password(&secret).is_ok() {
                        let _ = old.delete_credential();
                    }
                    Ok(Some(secret))
                }
                Err(KeyringError::NoEntry) => Ok(None),
                Err(error) => Err(error),
            }
        }
        Err(error) => Err(error),
    }
}


pub(crate) fn read_secret_bytes_with_fallback(service: &str, account: &str) -> Result<Option<Vec<u8>>, KeyringError> {
    let current = Entry::new(service, account)?;
    match current.get_secret() {
        Ok(secret) => Ok(Some(secret)),
        Err(KeyringError::NoEntry) => {
            let Some(old_service) = old_service_name(service) else {
                return Ok(None);
            };
            let old = Entry::new(&old_service, account)?;
            match old.get_secret() {
                Ok(secret) => {
                    if current.set_secret(&secret).is_ok() {
                        let _ = old.delete_credential();
                    }
                    Ok(Some(secret))
                }
                Err(KeyringError::NoEntry) => Ok(None),
                Err(error) => Err(error),
            }
        }
        Err(error) => Err(error),
    }
}
pub(crate) fn delete_credential_with_fallback(service: &str, account: &str) -> Result<(), KeyringError> {
    let current = Entry::new(service, account)?;
    match current.delete_credential() {
        Ok(()) | Err(KeyringError::NoEntry) => {}
        Err(error) => return Err(error),
    }
    if let Some(old_service) = old_service_name(service) {
        let old = Entry::new(&old_service, account)?;
        match old.delete_credential() {
            Ok(()) | Err(KeyringError::NoEntry) => {}
            Err(error) => return Err(error),
        }
    }
    Ok(())
}
/// Whether a pre-rename startup entry still exists.
pub(crate) fn legacy_startup_value_present() -> bool {
    registry::read_string(HKEY_CURRENT_USER, STARTUP_KEY, OLD_STARTUP_VALUE).is_some()
}

pub(crate) fn delete_legacy_startup_value() {
    // A failed Run deletion must keep the old entry's disabled marker intact.
    if registry::delete_value(HKEY_CURRENT_USER, STARTUP_KEY, OLD_STARTUP_VALUE).is_ok() {
        let _ = registry::delete_value(HKEY_CURRENT_USER, STARTUP_APPROVED_KEY, OLD_STARTUP_VALUE);
    }
}
/// Removes the former rule filename when the reply marker is switched off.
pub(crate) fn remove_legacy_reply_marker_file(claude_dir: &Path) {
    let _ = fs::remove_file(claude_dir.join(OLD_RULES_FILE));
}

/// Removes a former reply-marker block from a user-owned file while leaving all other text intact.
pub(crate) fn without_legacy_reply_block(text: &str) -> String {
    let Some(start) = text.find(OLD_REPLY_PREFIX) else {
        return text.to_string();
    };
    let Some(end_offset) = text[start..].find(OLD_REPLY_END) else {
        return text.to_string();
    };
    let end = start + end_offset + OLD_REPLY_END.len();
    let before = text[..start].trim_end();
    let after = text[end..].trim_start_matches(['\r', '\n']);
    let newline = if text.contains("\r\n") { "\r\n" } else { "\n" };
    match (before.is_empty(), after.is_empty()) {
        (true, _) => after.to_string(),
        (false, true) => format!("{before}{newline}"),
        (false, false) => format!("{before}{newline}{newline}{after}"),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{SystemTime, UNIX_EPOCH};

    #[test]
    fn startup_migration_prefers_the_current_registration() {
        assert_eq!(startup_migration(false, false), StartupMigration::Skip);
        assert_eq!(startup_migration(false, true), StartupMigration::Skip);
        assert_eq!(startup_migration(true, true), StartupMigration::RemoveDuplicate);
        assert_eq!(startup_migration(true, false), StartupMigration::Move);
    }
    fn temp_root(label: &str) -> PathBuf {
        let stamp = SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_nanos();
        std::env::temp_dir().join(format!("fly-island-migration-{label}-{stamp}"))
    }

    #[test]
    fn existing_destination_is_never_overwritten() {
        let root = temp_root("existing");
        let old = root.join("old");
        let new = root.join("new");
        fs::create_dir_all(&old).unwrap();
        fs::write(old.join("state.json"), "old").unwrap();
        fs::create_dir_all(&new).unwrap();
        fs::write(new.join("state.json"), "new").unwrap();
        assert_eq!(migrate_directory(&old, &new), DirectoryMigration::NotNeeded);
        assert_eq!(fs::read_to_string(new.join("state.json")).unwrap(), "new");
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn rename_failure_falls_back_to_a_recursive_copy() {
        let root = temp_root("fallback");
        let old = root.join("old");
        let new = root.join("new");
        fs::create_dir_all(old.join("nested")).unwrap();
        fs::write(old.join("nested/state.json"), "old").unwrap();
        let migrated = migrate_directory_with(&old, &new, |_source, _destination| {
            Err(std::io::Error::other("forced rename failure"))
        });
        assert_eq!(migrated, DirectoryMigration::Moved);
        assert_eq!(fs::read_to_string(new.join("nested/state.json")).unwrap(), "old");
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn a_failed_copy_leaves_no_new_directory_behind() {
        let root = temp_root("failed");
        let old = root.join("old");
        fs::create_dir_all(&old).unwrap();
        // A file where the new directory should go makes both the rename and the copy fail.
        fs::write(root.join("blocker"), "").unwrap();
        let blocked_new = root.join("blocker").join("new");
        let result = migrate_directory_with(&old, &blocked_new, |_source, _destination| {
            Err(std::io::Error::other("forced rename failure"))
        });
        assert_eq!(result, DirectoryMigration::Failed);
        assert!(!blocked_new.exists() && old.is_dir());
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn hook_normalization_accepts_both_generations() {
        let old = format!("{OLD_HOOK_SIGNATURE}status.ps1\n{OLD_HOOK_MARKER}");
        assert!(contains_managed_hook_signature(&old));
        assert_eq!(normalize_hook_text(&old), "fly-island-agent-status.ps1\nFly Island Agent Status Hooks");
    }

    #[test]
    fn legacy_backup_identity_and_keys_are_normalized_without_overwriting_new_values() {
        let mut value = serde_json::json!({
            "app": OLD_BACKUP_APP_NAMES[1],
            "localStorage": serde_json::json!({
                "fly-island-settings": "new"
            })
        });
        value["localStorage"][format!("{OLD_STORAGE_PREFIX}settings")] = serde_json::json!("old");
        normalize_legacy_backup_value(&mut value);
        assert_eq!(value["app"], "fly-island");
        assert_eq!(value["localStorage"]["fly-island-settings"], "new");
        assert!(value["localStorage"].get(format!("{OLD_STORAGE_PREFIX}settings")).is_none());
    }

    #[test]
    fn legacy_log_names_move_into_the_current_log_contract() {
        let root = temp_root("logs");
        let old = root.join("old");
        let new = root.join("new");
        fs::create_dir_all(old.join("logs")).unwrap();
        fs::create_dir_all(new.join("logs")).unwrap();
        fs::write(old.join("logs").join(OLD_LOG_FILES[0].0), "old\n").unwrap();
        fs::write(new.join("logs/fly-island.log"), "new\n").unwrap();
        migrate_legacy_log_files(&old, &new);
        // The old lines follow the new ones, then the migration notes itself.
        assert!(fs::read_to_string(new.join("logs/fly-island.log")).unwrap().starts_with("new\nold\n"));
        assert!(!old.join("logs").join(OLD_LOG_FILES[0].0).exists());
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn credential_service_fallback_keeps_the_same_suffix() {
        let current = format!("{NEW_IDENTIFIER}.qq-mail");
        let old = format!("{OLD_IDENTIFIER}.qq-mail");
        assert_eq!(old_service_name(&current).as_deref(), Some(old.as_str()));
        assert_eq!(old_service_name("other.service"), None);
    }

    #[test]
    fn reply_marker_cleanup_only_removes_the_managed_block() {
        let text = format!("# before\n\n{OLD_REPLY_PREFIX} v1 -->\nold\n{OLD_REPLY_END}\n\n# after\n");
        assert_eq!(without_legacy_reply_block(&text), "# before\n\n# after\n");
    }
    #[test]
    fn package_and_tauri_config_use_current_names() {
        assert_eq!(env!("CARGO_PKG_NAME"), "fly-island");
        let config: serde_json::Value = serde_json::from_str(include_str!("../../tauri.conf.json")).unwrap();
        assert_eq!(config["productName"], "fly-island");
        assert_eq!(config["identifier"], NEW_IDENTIFIER);
        assert!(!config.to_string().contains(OLD_IDENTIFIER));
    }
}
