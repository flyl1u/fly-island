//! Moving the todo keys out of the island window's localStorage into
//! `todos.json`. Rust cannot read localStorage, so the window sends the stored
//! text of each key together with the same data run through normalize.ts.
//! Rules: docs/architecture/plugin-platform.md, P6 「从已发布的旧版本升级」.
//!
//! Nothing is ever deleted: the old keys stay in localStorage, the stored text
//! goes to `todos-migration-backup.json`, and a `todos.json` that is replaced
//! is first copied to `todos.before-reimport-<ms>.json`.

use serde::{Deserialize, Serialize};
use serde_json::json;
use sha2::{Digest, Sha256};
use std::{
    collections::HashSet,
    fs,
    path::Path,
    time::{SystemTime, UNIX_EPOCH},
};

use super::{
    model::{Migration, TodosData, TodosFile, FILE_VERSION},
    store::{self, LoadError},
};

pub(crate) const FILE_NAME: &str = "todos.json";
const BACKUP_FILE_NAME: &str = "todos-migration-backup.json";
const MIGRATION_VERSION: u32 = 1;

/// The stored text of each migrated localStorage key (`None`: not set), named
/// as in localStorage. Mirrored by `LocalTodoKeys` in src/features/todos/api.ts.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
pub struct LocalTodoKeys {
    #[serde(rename = "focusd-island-todos", default)]
    pub todos: Option<String>,
    #[serde(rename = "focusd-island-archives", default)]
    pub archives: Option<String>,
    #[serde(rename = "focusd-island-scheduled-todos", default)]
    pub scheduled_todos: Option<String>,
    #[serde(rename = "focusd-island-daily-note", default)]
    pub daily_note: Option<String>,
    #[serde(rename = "focusd-island-active-todo", default)]
    pub active_todo: Option<String>,
    #[serde(rename = "focusd-island-current-date", default)]
    pub current_date: Option<String>,
}

impl LocalTodoKeys {
    fn is_empty(&self) -> bool {
        *self == Self::default()
    }
}

/// SHA-256 (hex) of the keys' text in a fixed order; tells whether an older
/// FocuSD Island changed localStorage after the migration.
pub(crate) fn source_hash(keys: &LocalTodoKeys) -> String {
    let canonical = json!([
        keys.todos,
        keys.archives,
        keys.scheduled_todos,
        keys.daily_note,
        keys.active_todo,
        keys.current_date
    ])
    .to_string();
    Sha256::digest(canonical.as_bytes()).iter().map(|byte| format!("{byte:02x}")).collect()
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum Plan {
    /// `todos.json` holds the data; localStorage is what it was migrated from (or empty).
    UseFile,
    /// Read localStorage into `todos.json`. `keep_old` copies the current file
    /// first; `reimport` tells the user an older version's changes were taken.
    Import { keep_old: bool, reimport: bool },
}

/// What to do at start-up. An unreadable file, or one from a newer version,
/// is never replaced: the caller falls back to localStorage instead.
/// `already_imported`: this exact localStorage text was imported before (a
/// migration backup has its hash), so todos.json holds everything since.
pub(crate) fn plan(
    existing: &Result<Option<TodosFile>, LoadError>,
    hash: &str,
    local_empty: bool,
    already_imported: bool,
) -> Result<Plan, String> {
    match existing {
        Ok(None) => Ok(Plan::Import { keep_old: false, reimport: false }),
        Ok(Some(file)) if file.migration.as_ref().is_some_and(|migration| migration.source_hash == hash) => Ok(Plan::UseFile),
        // Cleared localStorage (new WebView profile) must not empty the list.
        Ok(Some(_)) if local_empty => Ok(Plan::UseFile),
        // Another build of the island (`pnpm tauri dev` next to the installed app) keeps
        // its own localStorage with its own pre-migration text. Switching builds must not
        // import that stale copy again over the todos made since.
        Ok(Some(_)) if already_imported => Ok(Plan::UseFile),
        // localStorage changed after the migration: an older version was used.
        Ok(Some(_)) => Ok(Plan::Import { keep_old: true, reimport: true }),
        Err(LoadError::Damaged(_)) => Ok(Plan::Import { keep_old: true, reimport: false }),
        Err(error) => Err(error.message().to_string()),
    }
}

/// What the island window gets back. Mirrored by `TodosSnapshot` in src/features/todos/api.ts.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TodosSnapshot {
    pub revision: u64,
    pub data: TodosData,
    /// "reimported" when an older version's changes replaced todos.json.
    pub notice: Option<&'static str>,
}

/// Runs the migration in `dir` (the app data folder). Returns the data now in
/// use and the notice for the user, or why localStorage must stay in use.
pub(crate) fn migrate(
    dir: &Path,
    keys: &LocalTodoKeys,
    normalized: TodosData,
    app_version: &str,
) -> Result<(TodosFile, Option<&'static str>), String> {
    let path = dir.join(FILE_NAME);
    let hash = source_hash(keys);
    let existing = store::load(&path);
    let already_imported = imported_hashes(dir).contains(&hash);
    let (keep_old, reimport) = match plan(&existing, &hash, keys.is_empty(), already_imported)? {
        Plan::UseFile => {
            return match existing {
                Ok(Some(file)) => Ok((file, None)),
                _ => Err("todos.json disappeared while reading it.".into()),
            };
        }
        Plan::Import { keep_old, reimport } => (keep_old, reimport),
    };
    let now = now_ms();
    backup_local(dir, keys, &hash, app_version, now)?;
    if keep_old {
        let old = fs::read(&path).map_err(|error| format!("Could not read {}: {error}", path.display()))?;
        store::write_new(&dir.join(format!("todos.before-reimport-{now}.json")), &old)?;
    }
    let revision = match &existing {
        Ok(Some(file)) => file.revision + 1,
        _ => 0,
    };
    let file = TodosFile {
        version: FILE_VERSION,
        revision,
        migration: Some(Migration {
            version: MIGRATION_VERSION,
            from_app_version: app_version.to_string(),
            at: now,
            source_hash: hash,
        }),
        data: normalized,
    };
    store::save(&path, &file)?;
    Ok((file, reimport.then_some("reimported")))
}

/// The source hashes of every localStorage text imported so far, from the
/// migration backups (`todos-migration-backup*.json`), which are never deleted.
fn imported_hashes(dir: &Path) -> HashSet<String> {
    let Ok(entries) = fs::read_dir(dir) else {
        return HashSet::new();
    };
    entries
        .flatten()
        .filter(|entry| {
            let name = entry.file_name();
            let name = name.to_string_lossy();
            name.starts_with("todos-migration-backup") && name.ends_with(".json")
        })
        .filter_map(|entry| fs::read_to_string(entry.path()).ok())
        .filter_map(|text| serde_json::from_str::<serde_json::Value>(&text).ok())
        .filter_map(|backup| backup.get("sourceHash").and_then(serde_json::Value::as_str).map(str::to_string))
        .collect()
}

/// Keeps the stored text before anything is written. The first backup keeps
/// its name for good; a later one with different text gets a timestamp.
fn backup_local(dir: &Path, keys: &LocalTodoKeys, hash: &str, app_version: &str, now: u64) -> Result<(), String> {
    let content = json!({ "at": now, "fromAppVersion": app_version, "sourceHash": hash, "keys": keys });
    let first = dir.join(BACKUP_FILE_NAME);
    let same_as_first = fs::read_to_string(&first)
        .ok()
        .and_then(|text| serde_json::from_str::<serde_json::Value>(&text).ok())
        .is_some_and(|existing| existing.get("sourceHash").and_then(serde_json::Value::as_str) == Some(hash));
    if same_as_first {
        return Ok(());
    }
    fs::create_dir_all(dir).map_err(|error| format!("Could not create {}: {error}", dir.display()))?;
    let target = if first.exists() { dir.join(format!("todos-migration-backup-{now}.json")) } else { first };
    let text = serde_json::to_string_pretty(&content).map_err(|error| format!("Could not encode the backup: {error}"))?;
    store::write_new(&target, text.as_bytes())
}

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|elapsed| u64::try_from(elapsed.as_millis()).unwrap_or(u64::MAX))
        .unwrap_or(0)
}
